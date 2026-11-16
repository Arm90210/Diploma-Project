import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { registrationService, AccountUnavailable } from '../dist/modules/auth/registration.js';
import { verifyPassword } from '../dist/modules/auth/password.js';

test('live PostgreSQL: migrated schema, constraints and API readiness', async () => {
  try {
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    for (const name of ['User','Artist','Track','Genre','TrackGenre','Playlist','PlaylistTrack','Like','Region','ListeningEvent','Session']) {
      assert.ok(tables.some(t => t.tablename === name), `Missing table: ${name}`);
    }
    const constraints = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`;
    for (const name of ['Track_duration_positive','PlaylistTrack_position_nonnegative','ListeningEvent_duration_positive','ListeningEvent_completion_range','User_region_requires_consent','Region_not_own_parent','Session_expiry_after_creation','Session_token_hash_format','Track_slug_format']) {
      assert.ok(constraints.some(c => c.conname === name), `Missing CHECK: ${name}`);
    }
    const rollback = new Error('Rollback verification fixtures');
    await assert.rejects(db.$transaction(async tx => {
      const id = randomUUID();
      const user = await tx.user.create({ data: { email: `${id}@example.invalid`, username: id, displayName: 'Database test', passwordHash: 'not-a-login-hash', dataOrigin: 'SYNTHETIC' } });
      const artist = await tx.artist.create({ data: { name: 'Database test' } });
      const track = await tx.track.create({ data: { slug: `test-${id}`, title: 'Database test', uploaderId: user.id, artistId: artist.id, durationMs: 1000, audioKey: id, rightsStatement: 'Test fixture; no audio', dataOrigin: 'SYNTHETIC' } });
      async function rejected(sql, values, expectedCode) {
        await tx.$executeRawUnsafe('SAVEPOINT invalid_input');
        try {
          await tx.$executeRawUnsafe(sql, ...values);
          assert.fail('Invalid write was accepted');
        } catch (error) {
          assert.equal(error.meta?.driverAdapterError?.cause?.originalCode, expectedCode);
        } finally {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_input');
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT invalid_input');
        }
      }
      await rejected('UPDATE "Track" SET "durationMs" = 0 WHERE id = $1::uuid', [track.id], '23514');
      await rejected('UPDATE "Track" SET "artistId" = $1::uuid WHERE id = $2::uuid', [randomUUID(), track.id], '23503');
      const region = await tx.region.create({ data: { code: id, name: 'Test region', countryCode: 'AM' } });
      await rejected('UPDATE "User" SET "regionId" = $1::uuid WHERE id = $2::uuid', [region.id, user.id], '23514');
      await rejected('UPDATE "Region" SET "parentId" = id WHERE id = $1::uuid', [region.id], '23514');
      const playlist = await tx.playlist.create({ data: { ownerId: user.id, title: 'Test playlist' } });
      await tx.playlistTrack.create({ data: { playlistId: playlist.id, trackId: track.id, position: 0 } });
      await rejected('UPDATE "PlaylistTrack" SET position = -1 WHERE "playlistId" = $1::uuid', [playlist.id], '23514');
      const event = await tx.listeningEvent.create({ data: { playbackSessionId: randomUUID(), userId: user.id, trackId: track.id, listenedMs: 1000, completionRatio: 1, source: 'CATALOG', dataOrigin: 'SYNTHETIC' } });
      await rejected('UPDATE "ListeningEvent" SET "listenedMs" = 0 WHERE id = $1::uuid', [event.id], '23514');
      await rejected('UPDATE "ListeningEvent" SET "completionRatio" = 1.1 WHERE id = $1::uuid', [event.id], '23514');
      await rejected('INSERT INTO "Like" ("userId", "trackId") VALUES ($1::uuid,$2::uuid),($1::uuid,$2::uuid)', [user.id, track.id], '23505');
      const sessionUser = await tx.user.create({ data: { email: `${randomUUID()}@example.invalid`, username: randomUUID(), displayName: 'Session test', passwordHash: 'not-a-login-hash', dataOrigin: 'SYNTHETIC' } });
      const session = await tx.session.create({ data: { userId: sessionUser.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 86400000) } });
      await rejected('UPDATE "Session" SET "expiresAt" = "createdAt" WHERE id = $1::uuid', [session.id], '23514');
      await rejected('UPDATE "Session" SET "tokenHash" = $1 WHERE id = $2::uuid', ['raw-token', session.id], '23514');
      await rejected('UPDATE "Session" SET "userId" = $1::uuid WHERE id = $2::uuid', [randomUUID(), session.id], '23503');
      await rejected('INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt") SELECT $1::uuid, "userId", "tokenHash", "expiresAt" FROM "Session" WHERE id = $2::uuid', [randomUUID(), session.id], '23505');
      await tx.user.delete({ where: { id: sessionUser.id } });
      assert.equal(await tx.session.count({ where: { userId: sessionUser.id } }), 0);
      const indexes = await tx.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Session'`;
      for (const name of ['Session_tokenHash_key', 'Session_userId_idx', 'Session_expiresAt_idx']) assert.ok(indexes.some(i => i.indexname === name));
      const register = registrationService(tx);
      const profile = { email: `${randomUUID()}@example.invalid`, username: randomUUID(), displayName: 'Registration test', password: '  registration test password  ' };
      const registered = await register(profile);
      assert.equal(registered.passwordHash, undefined);
      const stored = await tx.user.findUniqueOrThrow({ where: { id: registered.id } });
      assert.notEqual(stored.passwordHash, profile.password);
      assert.equal(await verifyPassword(profile.password, stored.passwordHash), true);
      for (const duplicate of [{ ...profile, username: randomUUID() }, { ...profile, email: `${randomUUID()}@example.invalid` }]) {
        await tx.$executeRawUnsafe('SAVEPOINT duplicate_account');
        await assert.rejects(register(duplicate), AccountUnavailable);
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT duplicate_account');
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT duplicate_account');
      }
      throw rollback;
    }, { timeout: 15000 }), error => error === rollback);
    const app = createApp({ checkDatabase: async () => { await db.$queryRaw`SELECT 1`; } });
    const response = await request(app).get('/api/ready').expect(200);
    assert.deepEqual(response.body, { status: 'ready', database: 'connected' });
  } finally { await db.$disconnect(); }
});
