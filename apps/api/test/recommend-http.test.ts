import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { SessionService } from '../src/modules/auth/sessions.js';
import type { RecommendationService } from '../src/modules/recommend/service.js';

const token = 'e'.repeat(64);
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'u@example.invalid', username: 'u', displayName: 'U', createdAt: new Date() };
const sessions: SessionService = { login: async () => null, currentUser: async value => value === token ? user : null, logout: async () => {}, removeExpired: async () => ({ count: 0 }) };

test('recommendations require a session, validate the limit and use the session user', async () => {
  const calls: unknown[][] = [];
  const recommendations: RecommendationService = { forUser: async (...args) => { calls.push(args); return { recommendations: [], basis: 'catalog', rules: { historyDays: 180, neighbours: 20, minimumNeighbours: 5 } }; } };
  const app = createApp({ checkDatabase: async () => {}, sessions, recommendations });
  await request(app).get('/api/recommendations').expect(401);
  const as = (path: string) => request(app).get(path).set('Cookie', `musicsphere_session=${token}`);
  const response = await as('/api/recommendations').expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  await as('/api/recommendations?limit=5').expect(200);
  for (const query of ['?limit=0', '?limit=21', '?limit=x', '?userId=someone', '?limit=5&limit=6']) await as(`/api/recommendations${query}`).expect(400);
  assert.deepEqual(calls, [[user.id, 10], [user.id, 5]]);
});
