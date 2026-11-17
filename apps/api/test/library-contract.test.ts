import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_LIMITS, isUuid, parseImport, parsePlaylistCreate, parseTitle } from '../src/modules/library/contract.js';

const id = '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f71';
test('playlist titles are trimmed, bounded and free of control characters', () => {
  assert.equal(parseTitle('  Sunday morning  '), 'Sunday morning');
  assert.equal(parseTitle('é'.repeat(80)), 'é'.repeat(80));
  for (const value of ['', '   ', 'x'.repeat(81), 'a\nb', 'a\u0000', 42, null, undefined]) assert.equal(parseTitle(value), null, String(value));
});
test('playlist creation accepts only a title', () => {
  assert.deepEqual(parsePlaylistCreate({ title: ' Mine ' }), { title: 'Mine' });
  for (const body of [null, [], 'Mine', {}, { title: 'Mine', ownerId: id }, { title: 'Mine', isPublic: true }]) assert.equal(parsePlaylistCreate(body), null, JSON.stringify(body));
});
test('UUIDs are recognised strictly', () => {
  assert.ok(isUuid(id));
  for (const value of ['study-0', id.toUpperCase(), `${id}x`, '', 7]) assert.equal(isUuid(value), false, String(value));
});
test('import accepts browser references and rejects malformed or oversized bodies', () => {
  assert.deepEqual(parseImport({ liked: [id, 'study-0'], playlists: [{ title: ' Mine ', trackIds: [id] }] }), { liked: [id, 'study-0'], playlists: [{ title: 'Mine', trackIds: [id] }] });
  assert.deepEqual(parseImport({}), { liked: [], playlists: [] });
  const many = (n: number) => Array.from({ length: n }, () => id);
  for (const body of [
    null, [], { liked: 'x' }, { liked: [1] }, { liked: ['x'.repeat(81)] }, { extra: [] },
    { liked: many(IMPORT_LIMITS.liked + 1) },
    { playlists: Array.from({ length: IMPORT_LIMITS.playlists + 1 }, () => ({ title: 'a', trackIds: [] })) },
    { playlists: [{ title: '', trackIds: [] }] }, { playlists: [{ title: 'a', trackIds: [], ownerId: id }] },
    { playlists: [{ title: 'a', trackIds: many(IMPORT_LIMITS.tracksPerPlaylist + 1) }] },
    { liked: many(1000), playlists: [{ title: 'a', trackIds: many(500) }, { title: 'b', trackIds: many(500) }, { title: 'c', trackIds: many(1) }] },
  ]) assert.equal(parseImport(body), null, JSON.stringify(body).slice(0, 80));
});
