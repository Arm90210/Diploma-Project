import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { sessionService, tokenDigest } from '../dist/modules/auth/sessions.js';
import { recommendationService } from '../dist/modules/recommend/service.js';
import { seedDemoCatalog } from '../dist/modules/catalog/seed.js';

// Seven REAL fixture accounts with counted listens; all removed (with their events and likes) in finally.
test('live recommendations: personal picks from similar listeners, known tracks excluded, real catalog only', async () => {
  const ids = [];
  try {
    await seedDemoCatalog(db);
    const track = Object.fromEntries((await db.track.findMany({ where: { slug: { startsWith: 'study-' } }, select: { id: true, slug: true } })).map(t => [t.slug, t.id]));
    const account = async () => {
      const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, username: `rec_${randomUUID().slice(0, 8)}`, displayName: 'Recommendation fixture', passwordHash: 'not-a-login-hash' } });
      ids.push(user.id);
      return user;
    };
    const listen = (userId, slug) => db.listeningEvent.create({ data: { playbackSessionId: randomUUID(), userId, trackId: track[slug], listenedMs: 20_000, completionRatio: 0.9, source: 'CATALOG', policyVersion: 'listen-v1' } });
    const me = await account();
    await listen(me.id, 'study-3');                         // me: Jazz
    for (let i = 0; i < 6; i++) {                            // six Jazz listeners who also play study-7 (Jazz) and study-5 (Indie)
      const other = await account();
      await listen(other.id, 'study-3'); await listen(other.id, 'study-7'); await listen(other.id, 'study-5');
    }
    const token = randomBytes(32).toString('hex');
    await db.session.create({ data: { userId: me.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 3600_000) } });
    const app = createApp({ checkDatabase: async () => {}, sessions: sessionService(db), recommendations: recommendationService(db) });
    const get = async () => (await request(app).get('/api/recommendations?limit=10').set('Cookie', `musicsphere_session=${token}`).expect(200)).body;

    let result = await get();
    assert.equal(result.basis, 'neighbours');
    const slugs = result.recommendations.map(item => item.track.slug);
    // Both tracks were played by all six similar listeners, so they lead the list (order between them is a tie-break).
    assert.deepEqual(slugs.slice(0, 2).sort(), ['study-5', 'study-7']);
    assert.ok(result.recommendations.slice(0, 2).every(item => item.reason === 'neighbours'));
    assert.ok(!slugs.includes('study-3'), 'already heard');
    assert.ok(slugs.every(slug => !slug.startsWith('syn-track-')), 'real catalog only');
    assert.equal(new Set(slugs).size, slugs.length);
    assert.deepEqual(Object.keys(result.recommendations[0]).sort(), ['reason', 'track']);

    // Liking a track removes it from recommendations.
    await db.like.create({ data: { userId: me.id, trackId: track['study-7'] } });
    result = await get();
    assert.ok(!result.recommendations.some(item => item.track.slug === 'study-7'));

    // A brand-new account gets no personal picks (no history) but still a list.
    const fresh = await account();
    const freshToken = randomBytes(32).toString('hex');
    await db.session.create({ data: { userId: fresh.id, tokenHash: tokenDigest(freshToken), expiresAt: new Date(Date.now() + 3600_000) } });
    const cold = (await request(app).get('/api/recommendations').set('Cookie', `musicsphere_session=${freshToken}`).expect(200)).body;
    assert.ok(cold.recommendations.length > 0);
    assert.ok(cold.recommendations.every(item => item.reason !== 'neighbours'));
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
