import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readSessionCookie } from '../src/modules/auth/session-http.js';
import { attemptLimiter } from '../src/modules/auth/limits.js';
import { SESSION_COOKIE, validateLogin, type SessionService } from '../src/modules/auth/sessions.js';
const origin = 'http://localhost:5173';
const token = 'a'.repeat(64);
const user = { id: 'test', email: 'test@example.com', username: 'test', displayName: 'Test', createdAt: new Date() };
const credentials = { email: ' TEST@example.com ', password: ' a long password ' };
function setup(overrides: Partial<SessionService> = {}, secureCookies = false) {
  const sessions: SessionService = {
    login: async () => ({ user, token, expiresAt: new Date(Date.now() + 604800000) }),
    currentUser: async value => value === token ? user : null,
    logout: async () => {}, removeExpired: async () => ({ count: 0 }), ...overrides,
  };
  return createApp({ checkDatabase: async () => {}, sessions, allowedOrigins: [origin], secureCookies });
}
test('login validation preserves passwords and rejects extra fields', () => {
  assert.deepEqual(validateLogin(credentials), { ...credentials, email: 'test@example.com' });
  for (const value of [null, [], { ...credentials, token }, { ...credentials, password: '' }, { ...credentials, password: '🎵'.repeat(129) }, { ...credentials, email: 'bad' }]) assert.equal(validateLogin(value), null);
});
test('cookie parsing rejects malformed and ambiguous session credentials', () => {
  assert.equal(readSessionCookie(`other=x; ${SESSION_COOKIE}=${token}`), token);
  for (const header of [undefined, `${SESSION_COOKIE}=%aa`, `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE}=${token}`, `${SESSION_COOKIE}=${token}=extra`, `${SESSION_COOKIE}=${'a'.repeat(63)}`]) assert.equal(readSessionCookie(header), undefined);
});
test('login cookie is HttpOnly, same-site, host-only and secure in production', async () => {
  for (const secure of [false, true]) {
    const result = await request(setup({}, secure)).post('/api/auth/login').set('Origin', origin).send(credentials).expect(200);
    const cookie = result.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=604800/); assert.equal(cookie.includes('Secure'), secure); assert.ok(!cookie.includes('Domain='));
    assert.deepEqual(Object.keys(result.body), ['user']); assert.equal(JSON.stringify(result.body).includes(token), false);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
});
test('current user requires cookie, ignores query tokens and clears invalid cookie', async () => {
  const app = setup();
  await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(200);
  const absent = await request(app).get(`/api/auth/me?token=${token}`).expect(401);
  assert.equal(absent.body.error.code, 'UNAUTHENTICATED');
  assert.match(absent.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});
test('login errors are generic and infrastructure errors do not set a cookie', async () => {
  const bad = await request(setup({ login: async () => null })).post('/api/auth/login').set('Origin', origin).send(credentials).expect(401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS'); assert.equal(bad.headers['set-cookie'], undefined);
  const failed = await request(setup({ login: async () => { throw new Error('secret'); } })).post('/api/auth/login').set('Origin', origin).send(credentials).expect(500);
  assert.ok(!JSON.stringify(failed.body).includes('secret')); assert.equal(failed.headers['set-cookie'], undefined);
});
test('login and logout enforce origin/content type before calling services', async () => {
  let calls = 0;
  const app = setup({ login: async () => { calls++; return null; }, logout: async () => { calls++; } });
  for (const path of ['login', 'logout']) {
    for (const value of ['', 'null', 'https://evil.example']) await request(app).post(`/api/auth/${path}`).set('Origin', value).send(credentials).expect(403);
    await request(app).post(`/api/auth/${path}`).set('Origin', origin).type('text').send('x').expect(415);
  }
  assert.equal(calls, 0);
});
test('logout revokes supplied cookie and clears identical cookie attributes', async () => {
  const revoked: Array<string | undefined> = [];
  const app = setup({ logout: async value => { revoked.push(value); } }, true);
  const result = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', `${SESSION_COOKIE}=${token}`).send({}).expect(204);
  assert.deepEqual(revoked, [token]);
  assert.match(result.headers['set-cookie'][0], /Path=\/; Expires=Thu, 01 Jan 1970.*HttpOnly; Secure; SameSite=Lax/);
  await request(app).post('/api/auth/logout').set('Origin', origin).send({}).expect(204);
});
test('account limit canonicalizes email and IP limit applies across accounts', async () => {
  const app = setup({ login: async () => null });
  for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').set('Origin', origin).send(credentials).expect(401);
  await request(app).post('/api/auth/login').set('Origin', origin).send({ ...credentials, email: 'test@example.com' }).expect(429);
  const other = setup({ login: async () => null });
  for (let i = 0; i < 30; i++) await request(other).post('/api/auth/login').set('Origin', origin).set('X-Forwarded-For', `203.0.113.${i}`).send({ ...credentials, email: `user${i}@example.com` }).expect(401);
  const result = await request(other).post('/api/auth/login').set('Origin', origin).send(credentials).expect(429);
  assert.ok(Number(result.headers['retry-after']) > 0);
});
test('rate limit windows expire without sleeping', () => {
  let time = 1000;
  const take = attemptLimiter(1, 100, () => time);
  assert.equal(take('ip'), 0); assert.ok(take('ip') > 0);
  time += 100; assert.equal(take('ip'), 0);
});

test('registration and login share the concurrency bound and release it after failure', async () => {
  let entered = 0;
  let bothEntered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { bothEntered = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  async function busy() {
    entered++;
    if (entered === 2) bothEntered();
    await hold;
    throw new Error('simulated dependency failure');
  }
  const app = createApp({ checkDatabase: async () => {}, allowedOrigins: [origin], register: busy, sessions: {
    login: busy, currentUser: async () => null, logout: async () => {}, removeExpired: async () => ({ count: 0 }),
  } });
  const first = request(app).post('/api/auth/register').set('Origin', origin).send({ ...credentials, username: 'tester', displayName: 'Tester' }).then(result => result);
  const second = request(app).post('/api/auth/login').set('Origin', origin).send(credentials).then(result => result);
  try {
    await ready;
    await request(app).post('/api/auth/login').set('Origin', origin).send(credentials).expect(429);
  } finally { release(); }
  assert.deepEqual((await Promise.all([first, second])).map(result => result.status), [500, 500]);
  await request(app).post('/api/auth/login').set('Origin', origin).send(credentials).expect(500);
});
