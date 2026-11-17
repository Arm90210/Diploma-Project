import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { SessionService } from '../src/modules/auth/sessions.js';
import { LibraryError, type LibraryService } from '../src/modules/library/service.js';

const origin = 'http://localhost:5173';
const token = 'b'.repeat(64);
const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.invalid', username: 'owner', displayName: 'Owner', createdAt: new Date() };
const trackId = '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f71';
const playlistId = '22222222-2222-4222-8222-222222222222';
const sessions: SessionService = { login: async () => null, currentUser: async value => value === token ? owner : null, logout: async () => {}, removeExpired: async () => ({ count: 0 }) };

function setup(overrides: Partial<LibraryService> = {}) {
  const calls: unknown[][] = [];
  const record = (name: string) => async (...args: unknown[]) => { calls.push([name, ...args]); };
  const library: LibraryService = {
    get: async userId => { calls.push(['get', userId]); return { likedTrackIds: [trackId], playlists: [] }; },
    like: record('like'), unlike: record('unlike'), deletePlaylist: record('deletePlaylist'), addTrack: record('addTrack'), removeTrack: record('removeTrack'),
    createPlaylist: async (userId, title) => { calls.push(['createPlaylist', userId, title]); return { id: playlistId, title, isPublic: false, trackIds: [] }; },
    importLibrary: async (userId, input) => { calls.push(['import', userId, input]); return { library: { likedTrackIds: [], playlists: [] }, imported: { likesAdded: 0, playlistsCreated: 0, playlistsMerged: 0, tracksAdded: 0, skipped: 0 } }; },
    ...overrides,
  };
  const app = createApp({ checkDatabase: async () => {}, sessions, library, allowedOrigins: [origin] });
  const as = (method: 'get' | 'put' | 'post' | 'delete', path: string) => request(app)[method](`/api/library${path}`).set('Cookie', `musicsphere_session=${token}`).set('Origin', origin);
  return { app, calls, as };
}

test('every library route requires a session', async () => {
  const { app, calls } = setup();
  for (const [method, path] of [['get', ''], ['put', `/likes/${trackId}`], ['delete', `/likes/${trackId}`], ['post', '/playlists'], ['delete', `/playlists/${playlistId}`], ['put', `/playlists/${playlistId}/tracks/${trackId}`], ['delete', `/playlists/${playlistId}/tracks/${trackId}`], ['post', '/import']] as const) {
    const response = await request(app)[method](`/api/library${path}`).set('Origin', origin).expect(401);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.deepEqual(calls, []);
});
test('ownership always comes from the session, never the request', async () => {
  const { as, calls } = setup();
  assert.deepEqual((await as('get', '').expect(200)).body, { library: { likedTrackIds: [trackId], playlists: [] } });
  await as('put', `/likes/${trackId}`).expect(204);
  await as('delete', `/likes/${trackId}`).expect(204);
  assert.equal((await as('post', '/playlists').send({ title: ' Mine ' }).expect(201)).body.playlist.title, 'Mine');
  await as('put', `/playlists/${playlistId}/tracks/${trackId}`).expect(204);
  await as('delete', `/playlists/${playlistId}/tracks/${trackId}`).expect(204);
  await as('delete', `/playlists/${playlistId}`).expect(204);
  await as('post', '/import').send({ liked: ['study-0'], playlists: [] }).expect(200);
  assert.deepEqual(calls, [
    ['get', owner.id], ['like', owner.id, trackId], ['unlike', owner.id, trackId], ['createPlaylist', owner.id, 'Mine'],
    ['addTrack', owner.id, playlistId, trackId], ['removeTrack', owner.id, playlistId, trackId], ['deletePlaylist', owner.id, playlistId],
    ['import', owner.id, { liked: ['study-0'], playlists: [] }],
  ]);
});
test('mutations reject untrusted origins, wrong content types, bad IDs and bad bodies before the service', async () => {
  const { as, calls } = setup();
  await as('put', `/likes/${trackId}`).set('Origin', 'https://evil.invalid').expect(403);
  await as('post', '/playlists').set('Origin', 'https://evil.invalid').send({ title: 'x' }).expect(403);
  await as('post', '/playlists').set('Content-Type', 'text/plain').send('title=x').expect(415);
  await as('put', '/likes/study-0').expect(400);
  await as('delete', `/playlists/${playlistId}/tracks/not-a-uuid`).expect(400);
  for (const body of [{}, { title: '' }, { title: 'x', ownerId: owner.id }]) await as('post', '/playlists').send(body).expect(400);
  await as('post', '/import').send({ liked: 'x' }).expect(400);
  await as('post', '/playlists').set('Content-Type', 'application/json').send('{bad').expect(400);
  await as('post', '/import').send({ liked: Array.from({ length: 4000 }, () => 'x'.repeat(40)) }).expect(413);
  assert.deepEqual(calls, []);
});
test('service errors map to 404/409 and unexpected errors stay generic', async () => {
  const notFound = setup({ addTrack: async () => { throw new LibraryError('NOT_FOUND', 'Playlist not found'); } });
  assert.equal((await notFound.as('put', `/playlists/${playlistId}/tracks/${trackId}`).expect(404)).body.error.code, 'NOT_FOUND');
  const missingTrack = setup({ like: async () => { throw new LibraryError('TRACK_NOT_FOUND', 'Track not found'); } });
  await missingTrack.as('put', `/likes/${trackId}`).expect(404);
  const limit = setup({ createPlaylist: async () => { throw new LibraryError('LIMIT', 'You can have up to 200 playlists'); } });
  assert.equal((await limit.as('post', '/playlists').send({ title: 'x' }).expect(409)).body.error.code, 'LIMIT');
  const broken = setup({ get: async () => { throw new Error('secret connection string'); } });
  const original = console.error; console.error = () => {};
  try { assert.doesNotMatch(JSON.stringify((await broken.as('get', '').expect(500)).body), /secret/); }
  finally { console.error = original; }
});
