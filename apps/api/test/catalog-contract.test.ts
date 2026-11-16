import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseTrackQuery, parseTrackRef, publicAssetUrl, toCatalogTrack, DEFAULT_LIMIT, MAX_LIMIT } from '../src/modules/catalog/contract.js';
import { DEMO_ARTIST, DEMO_TRACKS } from '../src/modules/catalog/demo-catalog.js';

// Pure rules: no Express, Prisma or database needed.
test('track query accepts bounded search, genre and paging', () => {
  assert.deepEqual(parseTrackQuery({}), { ok: true, value: { limit: DEFAULT_LIMIT, offset: 0 } });
  assert.deepEqual(parseTrackQuery({ q: '  night ', genre: 'Jazz', limit: '10', offset: '20' }), { ok: true, value: { q: 'night', genre: 'Jazz', limit: 10, offset: 20 } });
  assert.deepEqual(parseTrackQuery({ q: '   ' }), { ok: true, value: { limit: DEFAULT_LIMIT, offset: 0 } });
  assert.equal(parseTrackQuery({ limit: String(MAX_LIMIT) }).ok, true);
});
test('track query rejects unknown, repeated, oversized and malformed parameters', () => {
  for (const query of [
    { sort: 'title' }, { q: ['a', 'b'] }, { q: 'x'.repeat(101) }, { q: 'a\u0000b' }, { genre: 'g'.repeat(81) },
    { limit: '0' }, { limit: String(MAX_LIMIT + 1) }, { limit: '-1' }, { limit: '2.5' }, { limit: '1e2' }, { limit: '' },
    { offset: '-1' }, { offset: '10001' }, { offset: 'abc' },
  ]) assert.equal(parseTrackQuery(query).ok, false, JSON.stringify(query));
});
test('tracks are addressed by UUID or slug only', () => {
  assert.deepEqual(parseTrackRef('study-0'), { slug: 'study-0' });
  assert.deepEqual(parseTrackRef(DEMO_ARTIST.id), { id: DEMO_ARTIST.id });
  for (const ref of ['Study-0', 'study--0', '-study', 'study_0', '../etc', '', 'a'.repeat(81)]) assert.equal(parseTrackRef(ref), null, ref);
});
test('only bundled static keys become public URLs', () => {
  assert.equal(publicAssetUrl('static/audio/study-0.wav'), '/audio/study-0.wav');
  assert.equal(publicAssetUrl('static/art/cover-1.svg'), '/art/cover-1.svg');
  for (const key of [null, '', 'uploads/abc.wav', 'static/../.env', 'static//etc/passwd', 'static/', 'https://evil.example/x.wav']) assert.equal(publicAssetUrl(key), null, String(key));
});
test('public projection exposes catalog fields only', () => {
  const row = { id: 'id', slug: 'study-0', title: 'Golden Hour', durationMs: 24000, audioKey: 'static/audio/study-0.wav', coverKey: null,
    artist: { id: 'artist', name: 'MusicSphere Studio' }, genres: [{ genre: { name: 'Electronic' } }],
    uploaderId: 'secret-user', rightsStatement: 'internal', dataOrigin: 'REAL' };
  assert.deepEqual(toCatalogTrack(row), { id: 'id', slug: 'study-0', title: 'Golden Hour', artist: { id: 'artist', name: 'MusicSphere Studio' },
    genres: ['Electronic'], durationMs: 24000, audioUrl: '/audio/study-0.wav', coverUrl: null });
});
test('demo catalog matches the bundled original assets', () => {
  assert.equal(DEMO_TRACKS.length, 8);
  assert.equal(new Set(DEMO_TRACKS.map(track => track.slug)).size, 8);
  assert.equal(new Set(DEMO_TRACKS.map(track => track.audioKey)).size, 8);
  for (const track of DEMO_TRACKS) {
    assert.ok(parseTrackRef(track.slug) && 'slug' in parseTrackRef(track.slug)!);
    const audio = new URL(`../../web/public/${track.audioKey.slice('static/'.length)}`, import.meta.url);
    const cover = new URL(`../../web/public/${track.coverKey.slice('static/'.length)}`, import.meta.url);
    assert.ok(existsSync(cover), `missing ${cover.pathname}`);
    // Duration from the WAV header: data bytes / (sample rate × channels × bytes per sample).
    const wav = readFileSync(audio);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    const channels = wav.readUInt16LE(22), rate = wav.readUInt32LE(24), bits = wav.readUInt16LE(34);
    let offset = 12, dataBytes = 0;
    while (offset + 8 <= wav.length) { const id = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4); if (id === 'data') { dataBytes = size; break; } offset += 8 + size + (size % 2); }
    assert.equal(Math.round(dataBytes / (rate * channels * (bits / 8)) * 1000), track.durationMs, track.slug);
  }
});
