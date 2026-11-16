import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { db } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { accountFields } from '../dist/modules/auth/registration.js';
import { hashPassword } from '../dist/modules/auth/password.js';
import { sessionService, SESSION_COOKIE, SESSION_LIFETIME_MS, tokenDigest } from '../dist/modules/auth/sessions.js';

// Only these uniquely named fixture accounts are removed in finally; never wipe a database.
test('live login lifecycle: hashes, rotation, separate devices, expiry, revocation', async () => {
  const ids = [];
  try {
    const password = '  test login password  ';
    const passwordHash = await hashPassword(password);
    const email = `${randomUUID()}@example.invalid`;
    const account = await db.user.create({ data: { email, username: randomUUID(), displayName: 'Session lifecycle fixture', passwordHash, dataOrigin: 'SYNTHETIC' } });
    ids.push(account.id);
    let time = new Date();
    const sessions = sessionService(db, () => time);
    const origin = 'http://localhost:5173';
    const app = createApp({ checkDatabase: async () => {}, sessions, updateProfile: (id, displayName) => db.user.update({ where: { id }, data: { displayName }, select: accountFields }), allowedOrigins: [origin] });
    const login = (cookie, credentials = { email, password }) => {
      const req = request(app).post('/api/auth/login').set('Origin', origin);
      return (cookie ? req.set('Cookie', cookie) : req).send(credentials);
    };
    const cookieOf = result => result.headers['set-cookie'][0].split(';')[0];
    const me = cookie => request(app).get('/api/auth/me').set('Cookie', cookie);
    const logout = cookie => request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie).send({});
    const first = await login().expect(200);
    const firstCookie = cookieOf(first);
    const raw = firstCookie.slice(SESSION_COOKIE.length + 1);
    const stored = await db.session.findUniqueOrThrow({ where: { tokenHash: tokenDigest(raw) } });
    assert.notEqual(stored.tokenHash, raw);
    assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime(), SESSION_LIFETIME_MS);
    assert.deepEqual(Object.keys(first.body.user).sort(), ['id','email','username','displayName','createdAt'].sort());
    assert.equal(first.body.user.id, account.id);
    await me(firstCookie).expect(200);
    const edited = await request(app).patch('/api/users/me').set('Origin', origin).set('Cookie', firstCookie).send({ displayName: 'Updated fixture' }).expect(200);
    assert.equal(edited.body.user.displayName, 'Updated fixture');
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: account.id } })).displayName, 'Updated fixture');
    // A new app instance proves sessions survive process restart.
    await request(createApp({ checkDatabase: async () => {}, sessions: sessionService(db) })).get('/api/auth/me').set('Cookie', firstCookie).expect(200);
    const incorrect = await login(firstCookie, { email, password: password.trim() }).expect(401);
    const unknown = await login(undefined, { email: `${randomUUID()}@example.invalid`, password }).expect(401);
    assert.deepEqual(incorrect.body, unknown.body);
    await me(firstCookie).expect(200); // Failed login leaves existing session valid.
    assert.equal(await db.session.count({ where: { userId: account.id } }), 1);
    const secondCookie = cookieOf(await login(firstCookie).expect(200));
    assert.notEqual(secondCookie, firstCookie);
    await me(firstCookie).expect(401);
    await me(secondCookie).expect(200);
    const otherDevice = cookieOf(await login().expect(200));
    await logout(secondCookie).expect(204);
    await logout(secondCookie).expect(204);
    await me(secondCookie).expect(401);
    await me(otherDevice).expect(200);
    time = new Date(time.getTime() + SESSION_LIFETIME_MS);
    await me(otherDevice).expect(401); // Exact expiration boundary; no cleanup needed to deny access.
    assert.equal(await db.session.count({ where: { userId: account.id } }), 1);
    // Remove only this fixture; never run global cleanup with a future test clock.
    await db.session.deleteMany({ where: { userId: account.id } });
    assert.equal(await db.session.count({ where: { userId: account.id } }), 0);
    time = new Date();
    const finalCookie = cookieOf(await login().expect(200));
    await db.user.delete({ where: { id: account.id } });
    await me(finalCookie).expect(401);
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
