import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { CatalogService } from '../src/modules/catalog/service.js';
import type { CatalogTrack, TrackQuery } from '../src/modules/catalog/contract.js';

const track: CatalogTrack = { id: '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f71', slug: 'study-0', title: 'Golden Hour', artist: { id: 'artist', name: 'MusicSphere Studio' }, genres: ['Electronic'], durationMs: 24000, audioUrl: '/audio/study-0.wav', coverUrl: '/art/cover-0.svg' };
function fakeCatalog() {
  const calls: { list: TrackQuery[]; get: unknown[] } = { list: [], get: [] };
  const catalog: CatalogService = {
    listTracks: async query => { calls.list.push(query); return { tracks: [track], total: 1, limit: query.limit, offset: query.offset }; },
    getTrack: async ref => { calls.get.push(ref); return ('slug' in ref && ref.slug === track.slug) || ('id' in ref && ref.id === track.id) ? track : null; },
    listGenres: async () => [{ name: 'Electronic', trackCount: 1 }],
  };
  return { calls, app: createApp({ checkDatabase: async () => {}, catalog }) };
}

test('catalog list passes only validated parameters to the service', async () => {
  const { app, calls } = fakeCatalog();
  const response = await request(app).get('/api/catalog/tracks?q=%20gold%20&genre=Electronic&limit=5').expect(200);
  assert.deepEqual(calls.list, [{ q: 'gold', genre: 'Electronic', limit: 5, offset: 0 }]);
  assert.deepEqual(response.body, { tracks: [track], total: 1, limit: 5, offset: 0 });
  assert.equal(response.headers['cache-control'], 'no-cache');
});
test('invalid catalog queries are rejected before reaching the database', async () => {
  const { app, calls } = fakeCatalog();
  for (const path of ['?limit=500', '?limit=abc', '?offset=-1', '?q=a&q=b', '?unknown=1', `?q=${'x'.repeat(101)}`]) {
    const response = await request(app).get(`/api/catalog/tracks${path}`).expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  await request(app).get('/api/catalog/tracks/Not_A_Ref').expect(400);
  assert.deepEqual(calls, { list: [], get: [] });
});
test('track detail resolves by slug or UUID and returns 404 when absent', async () => {
  const { app, calls } = fakeCatalog();
  assert.equal((await request(app).get('/api/catalog/tracks/study-0').expect(200)).body.track.title, 'Golden Hour');
  await request(app).get(`/api/catalog/tracks/${track.id}`).expect(200);
  const missing = await request(app).get('/api/catalog/tracks/study-99').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
  assert.deepEqual(calls.get, [{ slug: 'study-0' }, { id: track.id }, { slug: 'study-99' }]);
});
test('genres endpoint and failure handling', async () => {
  const { app } = fakeCatalog();
  assert.deepEqual((await request(app).get('/api/catalog/genres').expect(200)).body, { genres: [{ name: 'Electronic', trackCount: 1 }] });
  const failing = createApp({ checkDatabase: async () => {}, catalog: { listTracks: async () => { throw new Error('secret connection string'); }, getTrack: async () => null, listGenres: async () => [] } });
  const original = console.error; console.error = () => {};
  try {
    const response = await request(failing).get('/api/catalog/tracks').expect(500);
    assert.doesNotMatch(JSON.stringify(response.body), /secret/);
  } finally { console.error = original; }
  // Without a catalog dependency the routes do not exist.
  await request(createApp({ checkDatabase: async () => {} })).get('/api/catalog/tracks').expect(404);
});
