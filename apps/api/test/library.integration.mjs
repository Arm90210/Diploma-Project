import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { sessionService, tokenDigest } from '../dist/modules/auth/sessions.js';
import { libraryService } from '../dist/modules/library/service.js';
import { seedDemoCatalog } from '../dist/modules/catalog/seed.js';

const origin = 'http://localhost:5173';
// Two uniquely named fixture accounts; deleting them in finally cascades their
// sessions, likes and playlists. Nothing else in the database is removed.
test('live library: ownership isolation, persistence, idempotency, import and concurrency', async () => {
  const userIds = [];
  try {
    await seedDemoCatalog(db);
    const [t0, t1, t2] = (await db.track.findMany({ where: { slug: { in: ['study-0', 'study-1', 'study-2'] } }, orderBy: { slug: 'asc' }, select: { id: true } })).map(track => track.id);
    const account = async name => {
      const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, username: randomUUID().replaceAll('-', '_').slice(0, 30), displayName: name, passwordHash: 'not-a-login-hash', dataOrigin: 'SYNTHETIC' } });
      userIds.push(user.id);
      const token = randomBytes(32).toString('hex');
      await db.session.create({ data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 3600_000) } });
      return { user, cookie: `musicsphere_session=${token}` };
    };
    const alice = await account('Library owner fixture');
    const bob = await account('Library intruder fixture');
    const newApp = () => createApp({ checkDatabase: async () => {}, sessions: sessionService(db), library: libraryService(db), allowedOrigins: [origin] });
    let app = newApp();
    const as = (who, method, path) => request(app)[method](`/api/library${path}`).set('Cookie', who.cookie).set('Origin', origin);
    const view = async who => (await as(who, 'get', '').expect(200)).body.library;

    // Likes are idempotent and only real tracks can be liked.
    await as(alice, 'put', `/likes/${t0}`).expect(204);
    await as(alice, 'put', `/likes/${t0}`).expect(204);
    await as(alice, 'put', `/likes/${randomUUID()}`).expect(404);
    assert.deepEqual((await view(alice)).likedTrackIds, [t0]);

    // Playlist with ordered, de-duplicated tracks.
    const playlist = (await as(alice, 'post', '/playlists').send({ title: '  Evening  ' }).expect(201)).body.playlist;
    assert.equal(playlist.title, 'Evening');
    for (const id of [t0, t1, t0]) await as(alice, 'put', `/playlists/${playlist.id}/tracks/${id}`).expect(204);
    assert.deepEqual((await view(alice)).playlists, [{ id: playlist.id, title: 'Evening', isPublic: false, trackIds: [t0, t1] }]);

    // Another account can neither see nor change it (404, existence not revealed).
    assert.deepEqual(await view(bob), { likedTrackIds: [], playlists: [] });
    await as(bob, 'put', `/playlists/${playlist.id}/tracks/${t2}`).expect(404);
    await as(bob, 'delete', `/playlists/${playlist.id}/tracks/${t0}`).expect(404);
    await as(bob, 'delete', `/playlists/${playlist.id}`).expect(404);
    await as(bob, 'delete', `/likes/${t0}`).expect(204); // only affects Bob's own (absent) like
    // Persistence: a brand-new API instance (like a reload or server restart) sees the same library.
    app = newApp();
    const persisted = await view(alice);
    assert.deepEqual(persisted.likedTrackIds, [t0]);
    assert.deepEqual(persisted.playlists[0].trackIds, [t0, t1]);

    // Removing then re-adding appends to the end.
    await as(alice, 'delete', `/playlists/${playlist.id}/tracks/${t0}`).expect(204);
    await as(alice, 'put', `/playlists/${playlist.id}/tracks/${t0}`).expect(204);
    assert.deepEqual((await view(alice)).playlists[0].trackIds, [t1, t0]);

    // Concurrent additions to one playlist get distinct positions (row lock).
    const parallel = (await as(alice, 'post', '/playlists').send({ title: 'Parallel' }).expect(201)).body.playlist;
    await Promise.all([t0, t1, t2].map(id => as(alice, 'put', `/playlists/${parallel.id}/tracks/${id}`).expect(204)));
    const positions = await db.playlistTrack.findMany({ where: { playlistId: parallel.id }, select: { position: true } });
    assert.equal(new Set(positions.map(item => item.position)).size, 3);

    // Import: unknown/legacy references are skipped; repeating it changes nothing.
    const body = { liked: ['study-0', t1, randomUUID()], playlists: [{ title: 'From browser', trackIds: [t0, 'study-1', t0] }] };
    const first = (await as(bob, 'post', '/import').send(body).expect(200)).body;
    assert.deepEqual(first.imported, { likesAdded: 1, playlistsCreated: 1, playlistsMerged: 0, tracksAdded: 1, skipped: 3 });
    assert.deepEqual(first.library.likedTrackIds, [t1]);
    assert.deepEqual(first.library.playlists.map(list => [list.title, list.trackIds]), [['From browser', [t0]]]);
    const again = (await as(bob, 'post', '/import').send(body).expect(200)).body;
    assert.deepEqual(again.imported, { likesAdded: 0, playlistsCreated: 0, playlistsMerged: 1, tracksAdded: 0, skipped: 3 });
    assert.equal(again.library.playlists.length, 1);
    assert.equal((await view(alice)).playlists.length, 2, "Bob's import must not touch Alice's library");

    // Deleting a playlist removes its memberships; the database rejects blank titles.
    await as(alice, 'delete', `/playlists/${playlist.id}`).expect(204);
    assert.equal(await db.playlistTrack.count({ where: { playlistId: playlist.id } }), 0);
    await assert.rejects(db.playlist.create({ data: { ownerId: alice.user.id, title: '   ' } }));
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
