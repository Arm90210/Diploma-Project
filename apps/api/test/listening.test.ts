import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { SessionService } from '../src/modules/auth/sessions.js';
import { ListeningError, type ListeningService, type SessionView } from '../src/modules/listening/service.js';

const origin = 'http://localhost:5173';
const token = 'c'.repeat(64);
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'u@example.invalid', username: 'u', displayName: 'U', createdAt: new Date() };
const trackId = '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f71';
const sessionId = '33333333-3333-4333-8333-333333333333';
const sessions: SessionService = { login: async () => null, currentUser: async value => value === token ? user : null, logout: async () => {}, removeExpired: async () => ({ count: 0 }) };
const view: SessionView = { id: sessionId, policyVersion: 'listen-v1', heartbeatIntervalMs: 10000, qualifyAfterMs: 12000, accumulatedMs: 0, completion: 0, qualified: false, counted: false, ended: false };

function setup(overrides: Partial<ListeningService> = {}) {
  const calls: unknown[][] = [];
  const listening: ListeningService = {
    start: async (...args) => { calls.push(['start', ...args]); return view; },
    heartbeat: async (...args) => { calls.push(['heartbeat', ...args]); return view; },
    end: async (...args) => { calls.push(['end', ...args]); return { ...view, ended: true }; },
    history: async (...args) => { calls.push(['history', ...args]); return { listens: [], total: 0 }; },
    trackStats: async (...args) => { calls.push(['stats', ...args]); return { origin: 'REAL', window: 'all-time', minimumListeners: 10, listeners: null, listens: null, yourListens: args[1] ? 2 : null }; },
    ...overrides,
  };
  const app = createApp({ checkDatabase: async () => {}, sessions, listening, allowedOrigins: [origin] });
  const as = (method: 'get' | 'post', path: string) => request(app)[method](`/api/listening${path}`).set('Cookie', `musicsphere_session=${token}`).set('Origin', origin);
  return { app, calls, as };
}
const beat = { sequence: 1, positionMs: 0, playing: true };

test('recording and history require a session; identity comes from the cookie', async () => {
  const { app, as, calls } = setup();
  await request(app).post('/api/listening/sessions').set('Origin', origin).send({ trackId, source: 'CATALOG' }).expect(401);
  await request(app).post(`/api/listening/sessions/${sessionId}/heartbeats`).set('Origin', origin).send(beat).expect(401);
  await request(app).post(`/api/listening/sessions/${sessionId}/end`).set('Origin', origin).send({}).expect(401);
  await request(app).get('/api/listening/history').expect(401);
  assert.deepEqual(calls, []);
  assert.equal((await as('post', '/sessions').send({ trackId, source: 'SEARCH' }).expect(201)).body.session.id, sessionId);
  await as('post', `/sessions/${sessionId}/heartbeats`).send(beat).expect(200);
  await as('post', `/sessions/${sessionId}/end`).send({}).expect(200);
  await as('post', `/sessions/${sessionId}/end`).send({ sequence: 2, positionMs: 5000, playing: false }).expect(200);
  await as('get', '/history?limit=5').expect(200);
  assert.deepEqual(calls, [
    ['start', user.id, trackId, 'SEARCH'], ['heartbeat', user.id, sessionId, beat], ['end', user.id, sessionId, null],
    ['end', user.id, sessionId, { sequence: 2, positionMs: 5000, playing: false }], ['history', user.id, 5],
  ]);
});
test('track stats are public and add the caller’s own count only with a valid session', async () => {
  const { app, as, calls } = setup();
  assert.equal((await request(app).get(`/api/listening/tracks/${trackId}/stats`).expect(200)).body.stats.yourListens, null);
  assert.equal((await as('get', `/tracks/${trackId}/stats`).expect(200)).body.stats.yourListens, 2);
  await request(app).get('/api/listening/tracks/study-0/stats').expect(400);
  assert.deepEqual(calls, [['stats', trackId, null], ['stats', trackId, user.id]]);
});
test('untrusted origins, wrong media types and malformed input never reach the service', async () => {
  const { as, calls } = setup();
  await as('post', '/sessions').set('Origin', 'https://evil.invalid').send({ trackId, source: 'CATALOG' }).expect(403);
  await as('post', '/sessions').set('Content-Type', 'text/plain').send('x').expect(415);
  for (const body of [{}, { trackId, source: 'NOPE' }, { trackId: 'study-0', source: 'CATALOG' }, { trackId, source: 'CATALOG', userId: user.id }]) await as('post', '/sessions').send(body).expect(400);
  await as('post', '/sessions/not-a-uuid/heartbeats').send(beat).expect(400);
  for (const body of [{ ...beat, sequence: 0 }, { ...beat, positionMs: -5 }, { ...beat, occurredAt: 'now' }, { sequence: 1, positionMs: 0 }, []]) await as('post', `/sessions/${sessionId}/heartbeats`).send(body).expect(400);
  await as('post', `/sessions/${sessionId}/end`).send({ playing: false }).expect(400);
  for (const query of ['?limit=0', '?limit=51', '?limit=x', '?before=1']) await as('get', `/history${query}`).expect(400);
  await as('post', `/sessions/${sessionId}/heartbeats`).set('Content-Type', 'application/json').send('{bad').expect(400);
  assert.deepEqual(calls, []);
});
test('service errors map to safe status codes', async () => {
  const cases: [ListeningError, number][] = [
    [new ListeningError('NOT_FOUND', 'Playback session not found'), 404], [new ListeningError('CLOSED', 'This playback session has ended'), 409],
    [new ListeningError('TRACK_NOT_FOUND', 'Track not found'), 404], [new ListeningError('ORIGIN_MISMATCH', 'x'), 409], [new ListeningError('RATE_LIMITED', 'x'), 429],
  ];
  for (const [error, status] of cases) {
    const { as } = setup({ heartbeat: async () => { throw error; } });
    const response = await as('post', `/sessions/${sessionId}/heartbeats`).send(beat).expect(status);
    assert.equal(response.body.error.code, error.code);
    if (status === 429) assert.equal(response.headers['retry-after'], '60');
  }
  const { as } = setup({ history: async () => { throw new Error('secret'); } });
  const original = console.error; console.error = () => {};
  try { assert.doesNotMatch(JSON.stringify((await as('get', '/history').expect(500)).body), /secret/); } finally { console.error = original; }
});
