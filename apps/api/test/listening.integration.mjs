import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { sessionService, tokenDigest } from '../dist/modules/auth/sessions.js';
import { listeningService } from '../dist/modules/listening/service.js';
import { seedDemoCatalog } from '../dist/modules/catalog/seed.js';

const origin = 'http://localhost:5173';
// Fixture accounts are REAL (events must share the track's origin) and uniquely
// named; deleting them in finally cascades their sessions and listening events.
// A controllable clock replaces waiting: pauses and the 30-minute cooldown are instant.
test('live listening: qualification, pause, seek, retries, cooldown, isolation and history', async () => {
  const userIds = [];
  let clock = Date.now();
  try {
    await seedDemoCatalog(db);
    const [t0, t1] = (await db.track.findMany({ where: { slug: { in: ['study-0', 'study-1'] } }, orderBy: { slug: 'asc' }, select: { id: true } })).map(track => track.id);
    const account = async (dataOrigin = 'REAL') => {
      const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, username: `listen_${randomUUID().slice(0, 8)}`, displayName: 'Listening fixture', passwordHash: 'not-a-login-hash', dataOrigin } });
      userIds.push(user.id);
      const token = randomBytes(32).toString('hex');
      await db.session.create({ data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 3600_000) } });
      return { user, cookie: `musicsphere_session=${token}` };
    };
    const alice = await account(), bob = await account(), synthetic = await account('SYNTHETIC');
    const app = createApp({ checkDatabase: async () => {}, sessions: sessionService(db), listening: listeningService(db, () => clock), allowedOrigins: [origin] });
    const post = (who, path, body) => request(app).post(`/api/listening${path}`).set('Cookie', who.cookie).set('Origin', origin).send(body);
    const start = async (who, trackId) => (await post(who, '/sessions', { trackId, source: 'CATALOG' }).expect(201)).body.session;
    const at = seconds => { clock = base + seconds * 1000; };
    // Each step: [seconds since session start, media position in seconds, playing]
    const run = async (who, session, steps, base0) => {
      let result; let sequence = 0;
      for (const [seconds, position, playing] of steps) { clock = base0 + seconds * 1000; result = (await post(who, `/sessions/${session.id}/heartbeats`, { sequence: ++sequence, positionMs: position * 1000, playing }).expect(200)).body.session; }
      return result;
    };
    let base = clock;
    const events = (userId, trackId) => db.listeningEvent.count({ where: { userId, trackId } });

    // 1. Continuous play qualifies at 12 s (half of 24 s); exactly one event, updated as play continues.
    base = clock; const s1 = await start(alice, t0);
    assert.equal(s1.qualifyAfterMs, 12_000);
    let state = await run(alice, s1, [[0, 0, true], [10, 10, true]], base);
    assert.deepEqual([state.accumulatedMs, state.qualified, state.counted], [10_000, false, false]);
    at(10.5); // a retried heartbeat (same sequence) changes nothing
    state = (await post(alice, `/sessions/${s1.id}/heartbeats`, { sequence: 2, positionMs: 10_000, playing: true }).expect(200)).body.session;
    assert.equal(state.accumulatedMs, 10_000);
    at(13); state = (await post(alice, `/sessions/${s1.id}/heartbeats`, { sequence: 3, positionMs: 13_000, playing: true }).expect(200)).body.session;
    assert.deepEqual([state.qualified, state.counted], [true, true]);
    at(24); await post(alice, `/sessions/${s1.id}/heartbeats`, { sequence: 4, positionMs: 24_000, playing: false }).expect(200);
    const event = await db.listeningEvent.findUniqueOrThrow({ where: { playbackSessionId: s1.id } });
    assert.deepEqual([event.userId, event.trackId, event.listenedMs, event.completionRatio, event.policyVersion, event.dataOrigin, event.source], [alice.user.id, t0, 24_000, 1, 'listen-v1', 'REAL', 'CATALOG']);
    assert.equal(event.occurredAt.getTime(), base + 13_000, 'occurredAt is the server qualification time');
    at(25); await post(alice, `/sessions/${s1.id}/end`, {}).expect(200);
    await post(alice, `/sessions/${s1.id}/end`, {}).expect(200); // ending twice is harmless
    await post(alice, `/sessions/${s1.id}/heartbeats`, { sequence: 5, positionMs: 24_000, playing: true }).expect(409);

    // 2. Another account cannot touch Alice's session.
    await post(bob, `/sessions/${s1.id}/heartbeats`, { sequence: 9, positionMs: 0, playing: true }).expect(404);
    await post(bob, `/sessions/${s1.id}/end`, {}).expect(404);

    // 3. A full replay 1 minute later qualifies but is not counted (30-minute cooldown).
    clock = base + 60_000; base = clock; const s2 = await start(alice, t0);
    state = await run(alice, s2, [[0, 0, true], [10, 10, true], [20, 20, true], [24, 24, false]], base);
    assert.deepEqual([state.qualified, state.counted], [true, false]);
    assert.equal(await events(alice.user.id, t0), 1);
    // 4. After 30 minutes it counts again.
    clock = base + 31 * 60_000; base = clock; const s3 = await start(alice, t0);
    state = await run(alice, s3, [[0, 0, true], [10, 10, true], [13, 13, true]], base);
    assert.deepEqual([state.qualified, state.counted], [true, true]);
    assert.equal(await events(alice.user.id, t0), 2);

    // 5. Paused time earns nothing: 5 s, a 10-minute pause, 5 s more = 10 s < 12 s.
    base = clock; const s4 = await start(bob, t1);
    state = await run(bob, s4, [[0, 0, true], [5, 5, false], [605, 5, true], [610, 10, true]], base);
    assert.deepEqual([state.accumulatedMs, state.qualified], [10_000, false]);
    // 6. Seeking to the end earns nothing and is not completion.
    base = clock; const s5 = await start(bob, t1);
    state = await run(bob, s5, [[0, 0, true], [0.5, 24, true]], base);
    clock += 100; state = (await post(bob, `/sessions/${s5.id}/end`, { sequence: 3, positionMs: 24_000, playing: false }).expect(200)).body.session;
    assert.deepEqual([state.accumulatedMs, state.completion, state.qualified, state.ended], [0, 0, false, true]);
    // 7. Five identical heartbeats sent at once are credited once.
    base = clock; const s6 = await start(bob, t1);
    await run(bob, s6, [[0, 0, true]], base);
    clock = base + 8_000;
    const burst = await Promise.all(Array.from({ length: 5 }, () => post(bob, `/sessions/${s6.id}/heartbeats`, { sequence: 2, positionMs: 8_000, playing: true }).expect(200)));
    assert.ok(burst.every(response => response.body.session.accumulatedMs === 8_000));
    assert.equal(await events(bob.user.id, t1), 0);

    // 8. Synthetic accounts cannot record listens on real tracks.
    await post(synthetic, '/sessions', { trackId: t0, source: 'CATALOG' }).expect(409);
    await post(alice, '/sessions', { trackId: randomUUID(), source: 'CATALOG' }).expect(404);

    // 9. History and stats.
    const history = (await request(app).get('/api/listening/history?limit=10').set('Cookie', alice.cookie).expect(200)).body;
    assert.equal(history.total, 2);
    assert.deepEqual(history.listens.map(item => item.track.slug), ['study-0', 'study-0']);
    assert.ok(history.listens[0].occurredAt > history.listens[1].occurredAt, 'most recent first');
    assert.equal((await request(app).get('/api/listening/history').set('Cookie', bob.cookie).expect(200)).body.total, 0);
    const mine = (await request(app).get(`/api/listening/tracks/${t0}/stats`).set('Cookie', alice.cookie).expect(200)).body.stats;
    assert.equal(mine.yourListens, 2);
    assert.ok(mine.listeners === null ? mine.listens === null : mine.listeners >= 10, 'audience numbers hidden below 10 listeners');
    assert.equal((await request(app).get(`/api/listening/tracks/${t0}/stats`).expect(200)).body.stats.yourListens, null);
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
