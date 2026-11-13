import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('liveness does not depend on database availability', async () => {
  const app = createApp({ checkDatabase: async () => { throw new Error('offline'); } });
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.headers['x-powered-by'], undefined);
});
test('readiness succeeds only when the database check succeeds', async () => {
  let checked = false;
  const app = createApp({ checkDatabase: async () => { checked = true; } });
  await request(app).get('/api/ready').expect(200);
  assert.equal(checked, true);
});
test('database errors return 503 without leaking details', async () => {
  const app = createApp({ checkDatabase: async () => { throw new Error('secret connection string'); } });
  const response = await request(app).get('/api/ready').expect(503);
  assert.deepEqual(response.body, { status: 'unavailable', database: 'disconnected' });
});
test('unknown endpoints return JSON 404', async () => {
  const app = createApp({ checkDatabase: async () => {} });
  assert.deepEqual((await request(app).get('/api/missing').expect(404)).body, { error: 'Route not found' });
});
test('malformed JSON returns a safe 400 response', async () => {
  const app = createApp({ checkDatabase: async () => {} });
  const response = await request(app).post('/api/missing').set('Content-Type', 'application/json').send('{bad').expect(400);
  assert.equal(response.body.error, 'Invalid JSON');
});

test('oversized JSON is rejected before reaching a route', async () => {
  const app = createApp({ checkDatabase: async () => {} });
  const response = await request(app).post('/api/missing').send({ data: 'a'.repeat(40000) }).expect(413);
  assert.equal(response.body.error, 'Request too large');
});
