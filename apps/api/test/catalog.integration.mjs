import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { catalogService } from '../dist/modules/catalog/service.js';
import { seedDemoCatalog } from '../dist/modules/catalog/seed.js';
import { DEMO_ARTIST, DEMO_TRACKS } from '../dist/modules/catalog/demo-catalog.js';

// Seeds the original demo catalog into the development database (the same,
// repeatable operation as `npm run db:seed`). Only the uniquely named SYNTHETIC
// fixture track created here is removed afterwards.
test('live catalog: repeatable seed, REAL-only API, search, detail and genres', async () => {
  const slugs = DEMO_TRACKS.map(track => track.slug);
  const demoRows = () => db.track.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true }, orderBy: { slug: 'asc' } });
  let fixtureId;
  try {
    await seedDemoCatalog(db);
    const first = await demoRows();
    assert.equal(first.length, DEMO_TRACKS.length);
    assert.deepEqual(await seedDemoCatalog(db), { tracks: DEMO_TRACKS.length, created: 0, updated: DEMO_TRACKS.length });
    assert.deepEqual(await demoRows(), first, 'Re-seeding must keep track UUIDs stable');
    assert.equal(await db.artist.count({ where: { id: DEMO_ARTIST.id } }), 1);
    assert.equal(await db.trackGenre.count({ where: { trackId: { in: first.map(row => row.id) } } }), DEMO_TRACKS.length);
    assert.equal(await db.track.count({ where: { slug: { in: slugs }, uploaderId: null, dataOrigin: 'REAL' } }), DEMO_TRACKS.length);
    await assert.rejects(db.track.update({ where: { id: first[0].id }, data: { slug: 'Not A Slug' } }));

    const jazz = await db.genre.findUniqueOrThrow({ where: { name: 'Jazz' } });
    const fixtureSlug = `synthetic-fixture-${randomUUID()}`;
    fixtureId = (await db.track.create({ data: { slug: fixtureSlug, title: 'Synthetic night fixture', artistId: DEMO_ARTIST.id, durationMs: 1000, audioKey: `test/${randomUUID()}`, rightsStatement: 'Test fixture; no audio', dataOrigin: 'SYNTHETIC', genres: { create: { genreId: jazz.id } } } })).id;

    const app = createApp({ checkDatabase: async () => {}, catalog: catalogService(db) });
    const list = (await request(app).get('/api/catalog/tracks?limit=100').expect(200)).body;
    const served = new Map(list.tracks.map(item => [item.slug, item]));
    assert.ok(!served.has(fixtureSlug), 'SYNTHETIC tracks must not appear in the public catalog');
    for (const demo of DEMO_TRACKS) {
      const item = served.get(demo.slug);
      assert.ok(item, `missing ${demo.slug}`);
      assert.deepEqual(Object.keys(item).sort(), ['artist', 'audioUrl', 'coverUrl', 'durationMs', 'genres', 'id', 'slug', 'title']);
      assert.deepEqual(item.genres, [demo.genre]);
      assert.equal(item.audioUrl, `/${demo.audioKey.slice('static/'.length)}`);
      assert.equal(item.durationMs, demo.durationMs);
    }
    const jazzSlugs = (await request(app).get('/api/catalog/tracks?genre=jazz&limit=100').expect(200)).body.tracks.map(item => item.slug);
    assert.ok(jazzSlugs.includes('study-3') && jazzSlugs.includes('study-7') && !jazzSlugs.includes('study-0') && !jazzSlugs.includes(fixtureSlug));
    const night = (await request(app).get('/api/catalog/tracks?q=NIGHT&limit=100').expect(200)).body.tracks.map(item => item.slug);
    assert.ok(night.includes('study-2') && !night.includes(fixtureSlug));
    const page = (await request(app).get('/api/catalog/tracks?limit=2&offset=1').expect(200)).body;
    assert.equal(page.tracks.length, 2);
    assert.equal(page.total, list.total);

    assert.equal((await request(app).get('/api/catalog/tracks/study-0').expect(200)).body.track.title, 'Golden Hour');
    assert.equal((await request(app).get(`/api/catalog/tracks/${first[0].id}`).expect(200)).body.track.slug, first[0].slug);
    await request(app).get(`/api/catalog/tracks/${fixtureSlug}`).expect(404);
    await request(app).get('/api/catalog/tracks/no-such-track').expect(404);

    const genres = (await request(app).get('/api/catalog/genres').expect(200)).body.genres;
    const realJazz = await db.trackGenre.count({ where: { genreId: jazz.id, track: { dataOrigin: 'REAL' } } });
    assert.equal(genres.find(item => item.name === 'Jazz')?.trackCount, realJazz);
  } finally {
    if (fixtureId) await db.track.delete({ where: { id: fixtureId } });
    await db.$disconnect();
  }
});
