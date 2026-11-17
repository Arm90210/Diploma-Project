// Runs with Node's built-in test runner and TypeScript type stripping (Node 24); no extra packages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromApiTrack, migrateLegacyLibrary, FALLBACK_COVER, type Library } from '../src/lib/catalog.ts';

const catalog = [{ id: 'uuid-0', slug: 'study-0' }, { id: 'uuid-1', slug: 'study-1' }];
test('legacy preview IDs become database IDs without losing anything', () => {
  const before: Library = { liked: ['study-0', 'uuid-1', 'removed-track'], playlists: [{ id: 'p', title: 'Mine', trackIds: ['study-1', 'study-0', 'uuid-0'] }], joined: ['indie'] };
  const after = migrateLegacyLibrary(before, catalog);
  assert.deepEqual(after, { liked: ['uuid-0', 'uuid-1', 'removed-track'], playlists: [{ id: 'p', title: 'Mine', trackIds: ['uuid-1', 'uuid-0'] }], joined: ['indie'] });
  assert.deepEqual(before.liked, ['study-0', 'uuid-1', 'removed-track'], 'input is not mutated');
});
test('an already migrated library is returned unchanged', () => {
  const library: Library = { liked: ['uuid-0'], playlists: [{ id: 'p', title: 'Mine', trackIds: ['uuid-1'] }], joined: [] };
  assert.equal(migrateLegacyLibrary(library, catalog), library);
});
test('API tracks map to player tracks', () => {
  const track = fromApiTrack({ id: 'uuid-0', slug: 'study-0', title: 'Golden Hour', artist: { id: 'a', name: 'MusicSphere Studio' }, genres: ['Electronic'], durationMs: 24000, audioUrl: '/audio/study-0.wav', coverUrl: null });
  assert.deepEqual(track, { id: 'uuid-0', slug: 'study-0', title: 'Golden Hour', artist: 'MusicSphere Studio', genre: 'Electronic', genres: ['Electronic'], cover: FALLBACK_COVER, src: '/audio/study-0.wav', duration: 24 });
});

import { importPayload, importTitle } from '../src/lib/libraryImport.ts';
test('browser titles are made valid for the account API', () => {
  assert.equal(importTitle('  Sunday\nmorning  '), 'Sunday morning');
  assert.equal(importTitle('   '), 'Imported playlist');
  assert.equal([...importTitle('é'.repeat(120))].length, 80);
});
test('import payload stays within the server bounds', () => {
  const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const payload = importPayload({ liked: ids(1200, 'l'), playlists: Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, title: `List ${i}`, trackIds: ids(600, 't') })) });
  assert.equal(payload.liked.length, 1000);
  assert.equal(payload.playlists.length, 100);
  assert.ok(payload.playlists.every(list => list.trackIds.length <= 500));
  assert.equal(payload.liked.length + payload.playlists.reduce((sum, list) => sum + list.trackIds.length, 0), 2000);
});
