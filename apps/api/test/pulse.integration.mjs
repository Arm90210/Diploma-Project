import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { sessionService, tokenDigest } from '../dist/modules/auth/sessions.js';
import { pulseService } from '../dist/modules/analytics/service.js';
import { locationService } from '../dist/modules/location/service.js';
import { replaceSyntheticDataset, seedRegions } from '../dist/modules/analytics/persist.js';
import { DEFAULT_CONFIG, generateSynthetic } from '../dist/modules/analytics/synthetic.js';
import { computePulse } from '../dist/modules/analytics/pulse.js';
import { pulseInputFrom } from '../dist/modules/analytics/evaluate.js';
import { seedDemoCatalog } from '../dist/modules/catalog/seed.js';

const origin = 'http://localhost:5173';
// (Re)writes the default synthetic dataset — the same deterministic data `npm run db:synthetic`
// produces — and checks that real data is untouched. The REAL fixture account is removed in finally.
test('live pulse: synthetic dataset round trip, real/synthetic isolation, consent and withdrawal', { timeout: 240_000 }, async () => {
  let fixtureId;
  try {
    await seedDemoCatalog(db); await seedRegions(db);
    const realCounts = async () => ({ users: await db.user.count({ where: { dataOrigin: 'REAL' } }), tracks: await db.track.count({ where: { dataOrigin: 'REAL' } }), events: await db.listeningEvent.count({ where: { dataOrigin: 'REAL' } }), likes: await db.like.count({ where: { user: { dataOrigin: 'REAL' } } }) });
    const before = await realCounts();
    const data = generateSynthetic(DEFAULT_CONFIG);
    const counts = await replaceSyntheticDataset(db, data);
    assert.deepEqual(counts, { users: data.users.length, tracks: data.tracks.length, events: data.events.length, likes: data.likes.length });
    assert.deepEqual(await realCounts(), before, 'real data untouched');
    assert.equal(await db.listeningEvent.count({ where: { dataOrigin: 'SYNTHETIC' } }), data.events.length);
    assert.equal(await db.syntheticDataset.count(), 1);
    const dataset = await db.syntheticDataset.findFirstOrThrow();
    assert.deepEqual([dataset.seed, dataset.generatorVersion, dataset.referenceDate.getTime()], [DEFAULT_CONFIG.seed, 'synthetic-v1', DEFAULT_CONFIG.referenceDate]);
    // Synthetic accounts cannot sign in; synthetic tracks never appear in the public catalog.
    const sessions = sessionService(db);
    assert.equal(await sessions.login({ email: data.users[0].email, password: 'any password at all, long enough' }), null);
    assert.equal(await db.track.count({ where: { slug: { startsWith: 'syn-track-' }, dataOrigin: 'REAL' } }), 0);

    const location = locationService(db);
    const app = createApp({ checkDatabase: async () => {}, sessions, pulse: pulseService(db), location, allowedOrigins: [origin] });
    // Database round trip: the API's synthetic numbers equal the in-memory computation for the same seed.
    for (const region of [null, 'DE']) {
      const served = (await request(app).get(`/api/pulse?origin=SYNTHETIC${region ? `&region=${region}` : ''}`).expect(200)).body.pulse;
      const expected = computePulse(pulseInputFrom(data, DEFAULT_CONFIG.referenceDate, region));
      assert.equal(served.label, 'Synthetic demonstration');
      assert.deepEqual(served.summary, expected.summary);
      assert.deepEqual(served.trending.map(row => [row.track.slug, row.U0, row.U1, Number(row.score.toFixed(9))]), expected.trending.map(row => [row.track.slug, row.U0, row.U1, Number(row.score.toFixed(9))]));
      assert.deepEqual(served.genres.shares.map(row => [row.genre, Number(row.share.toFixed(12))]), expected.genres.shares.map(row => [row.genre, Number(row.share.toFixed(12))]));
      const byCode = rows => rows.map(row => [row.code, row.listeners, row.distance === null ? null : Number(row.distance.toFixed(12))]).sort((x, y) => x[0].localeCompare(y[0]));
      assert.deepEqual(byCode(served.regions), byCode(expected.regions));
    }
    // The real view never contains synthetic tracks.
    const real = (await request(app).get('/api/pulse?origin=REAL').expect(200)).body.pulse;
    assert.equal(real.label, 'Our platform');
    assert.ok([...real.trending, ...real.popular].every(row => !row.track.slug.startsWith('syn-track-')));
    await request(app).get('/api/pulse?region=ZZ').expect(400);

    // Consent: choose a country, record a listen, withdraw → the listen loses its region.
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, username: `pulse_${randomUUID().slice(0, 8)}`, displayName: 'Pulse fixture', passwordHash: 'not-a-login-hash' } });
    fixtureId = user.id;
    const token = randomBytes(32).toString('hex');
    await db.session.create({ data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 3600_000) } });
    const as = (method, path) => request(app)[method](path).set('Cookie', `musicsphere_session=${token}`).set('Origin', origin);
    assert.deepEqual((await as('get', '/api/location').expect(200)).body, { region: null, consentedAt: null });
    const chosen = (await as('put', '/api/location').send({ code: 'AM', consent: true }).expect(200)).body;
    assert.equal(chosen.region.code, 'AM'); assert.ok(chosen.consentedAt);
    const track = await db.track.findFirstOrThrow({ where: { slug: 'study-0' } });
    const armenia = await db.region.findUniqueOrThrow({ where: { code: 'AM' } });
    await db.listeningEvent.create({ data: { playbackSessionId: randomUUID(), userId: user.id, trackId: track.id, listenedMs: 20_000, completionRatio: 0.8, regionId: armenia.id, source: 'CATALOG', policyVersion: 'listen-v1' } });
    await as('put', '/api/location').send({ code: 'DE', consent: true }).expect(200);
    assert.equal((await db.listeningEvent.findFirstOrThrow({ where: { userId: user.id } })).regionId, armenia.id, 'moving keeps the earlier snapshot');
    const withdrawn = (await as('delete', '/api/location').expect(200)).body;
    assert.deepEqual(withdrawn, { region: null, consentedAt: null, clearedEvents: 1 });
    assert.equal(await db.listeningEvent.count({ where: { userId: user.id, regionId: { not: null } } }), 0);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([after.regionId, after.locationConsentAt], [null, null]);
    await assert.rejects(db.user.update({ where: { id: user.id }, data: { regionId: armenia.id } }), 'region without consent is rejected by the database');
  } finally {
    if (fixtureId) await db.user.delete({ where: { id: fixtureId } });
    await db.$disconnect();
  }
});
