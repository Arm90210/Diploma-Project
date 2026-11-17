import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { SessionService } from '../src/modules/auth/sessions.js';
import { PulseError, type PulseService } from '../src/modules/analytics/service.js';
import { LocationError, type LocationService } from '../src/modules/location/service.js';

const origin = 'http://localhost:5173';
const token = 'd'.repeat(64);
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'u@example.invalid', username: 'u', displayName: 'U', createdAt: new Date() };
const sessions: SessionService = { login: async () => null, currentUser: async value => value === token ? user : null, logout: async () => {}, removeExpired: async () => ({ count: 0 }) };

function setup(pulseOverride: Partial<PulseService> = {}, locationOverride: Partial<LocationService> = {}) {
  const calls: unknown[][] = [];
  const pulse: PulseService = { regions: async () => [{ code: 'AM', name: 'Armenia' }], pulse: async (...args) => { calls.push(['pulse', ...args]); return { origin: args[0] } as never; }, ...pulseOverride };
  const location: LocationService = {
    mine: async id => { calls.push(['mine', id]); return { region: null, consentedAt: null }; },
    choose: async (id, code) => { calls.push(['choose', id, code]); return { region: { code, name: 'Armenia' }, consentedAt: '2026-11-17T00:00:00.000Z' }; },
    withdraw: async id => { calls.push(['withdraw', id]); return { region: null, consentedAt: null, clearedEvents: 3 }; },
    ...locationOverride,
  };
  const app = createApp({ checkDatabase: async () => {}, sessions, pulse, location, allowedOrigins: [origin] });
  return { app, calls, as: (method: 'get' | 'put' | 'delete', path: string) => request(app)[method](path).set('Cookie', `musicsphere_session=${token}`).set('Origin', origin) };
}

test('pulse is public, validated and never cached', async () => {
  const { app, calls } = setup();
  const response = await request(app).get('/api/pulse?origin=SYNTHETIC&region=AM').expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  await request(app).get('/api/pulse').expect(200);
  for (const query of ['?origin=BOTH', '?origin=real', '?region=Armenia', '?region=am', '?region=AM&region=DE', '?user=1']) await request(app).get(`/api/pulse${query}`).expect(400);
  assert.deepEqual(calls, [['pulse', 'SYNTHETIC', 'AM'], ['pulse', 'REAL', null]]);
  assert.deepEqual((await request(app).get('/api/pulse/regions').expect(200)).body, { regions: [{ code: 'AM', name: 'Armenia' }] });
});
test('pulse errors: unknown region 400, missing synthetic dataset 404', async () => {
  const unknown = setup({ pulse: async () => { throw new PulseError('UNKNOWN_REGION', 'Unknown region'); } });
  assert.equal((await request(unknown.app).get('/api/pulse?region=ZZ').expect(400)).body.error.code, 'UNKNOWN_REGION');
  const missing = setup({ pulse: async () => { throw new PulseError('NO_DATASET', 'No synthetic dataset yet.'); } });
  assert.equal((await request(missing.app).get('/api/pulse?origin=SYNTHETIC').expect(404)).body.error.code, 'NO_DATASET');
});
test('location requires a session, explicit consent, trusted origin and JSON', async () => {
  const { app, as, calls } = setup();
  await request(app).get('/api/location').expect(401);
  await request(app).put('/api/location').set('Origin', origin).send({ code: 'AM', consent: true }).expect(401);
  await as('put', '/api/location').set('Origin', 'https://evil.invalid').send({ code: 'AM', consent: true }).expect(403);
  await as('delete', '/api/location').set('Origin', 'https://evil.invalid').expect(403);
  await as('put', '/api/location').set('Content-Type', 'text/plain').send('AM').expect(415);
  for (const body of [{ code: 'AM' }, { code: 'AM', consent: 'yes' }, { code: 'AM', consent: false }, { code: 'Armenia', consent: true }, { code: 'AM', consent: true, userId: user.id }]) await as('put', '/api/location').send(body).expect(400);
  assert.deepEqual(calls, []);
  await as('get', '/api/location').expect(200);
  assert.equal((await as('put', '/api/location').send({ code: 'AM', consent: true }).expect(200)).body.region.code, 'AM');
  assert.equal((await as('delete', '/api/location').expect(200)).body.clearedEvents, 3);
  assert.deepEqual(calls, [['mine', user.id], ['choose', user.id, 'AM'], ['withdraw', user.id]]);
  const unknown = setup({}, { choose: async () => { throw new LocationError('UNKNOWN_REGION', 'Unknown region'); } });
  await unknown.as('put', '/api/location').send({ code: 'ZZ', consent: true }).expect(400);
});
