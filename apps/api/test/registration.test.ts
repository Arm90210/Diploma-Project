import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { validateRegistration, AccountUnavailable } from '../src/modules/auth/registration.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
const input = { email: ' TEST@example.com ', username: ' Test_User ', displayName: ' Test ', password: '  a long passphrase  ' };
const origin = 'http://localhost:5173';
function app(fail = false) {
  return createApp({ checkDatabase: async () => {}, allowedOrigins: [origin], register: async data => {
    if (fail) throw new AccountUnavailable();
    return { id: 'test', email: data.email, username: data.username, displayName: data.displayName, createdAt: new Date() };
  } });
}
test('registration canonicalizes profile fields without changing password', () => {
  assert.deepEqual(validateRegistration(input), { ...input, email: 'test@example.com', username: 'test_user', displayName: 'Test' });
  for (const value of [null, [], { ...input, role: 'admin' }, { ...input, password: 'short' }, { ...input, email: 'a..b@example.com' }, { ...input, username: 'a b' }, { ...input, displayName: '\u0000' }]) assert.equal(validateRegistration(value), null);
  assert.ok(validateRegistration({ ...input, password: '🎵'.repeat(15) }));
  assert.equal(validateRegistration({ ...input, password: '🎵'.repeat(129) }), null);
});
test('password hashes have unique salts and verify exact passwords', async () => {
  const start = performance.now();
  const first = await hashPassword(input.password);
  console.log(`scrypt hash: ${Math.round(performance.now() - start)} ms`);
  const second = await hashPassword(input.password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(input.password, first), true);
  assert.equal(await verifyPassword(input.password.trim(), first), false);
  assert.equal(await verifyPassword(input.password, 'invalid'), false);
});
test('registration returns canonical safe account fields without login cookie', async () => {
  const result = await request(app()).post('/api/auth/register').set('Origin', origin).send(input).expect(201);
  assert.equal(result.body.user.email, 'test@example.com');
  assert.equal(result.body.user.passwordHash, undefined);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(result.headers['cache-control'], 'no-store');
});
test('duplicate conflicts have a generic response', async () => {
  const result = await request(app(true)).post('/api/auth/register').set('Origin', origin).send(input).expect(409);
  assert.equal(result.body.error.code, 'ACCOUNT_UNAVAILABLE');
});
test('untrusted or absent origin and malformed inputs are rejected', async () => {
  for (const value of ['', 'null', 'https://evil.example']) await request(app()).post('/api/auth/register').set('Origin', value).send(input).expect(403);
  await request(app()).post('/api/auth/register').set('Origin', origin).type('text').send('hello').expect(415);
  const malformed = await request(app()).post('/api/auth/register').set('Origin', origin).type('json').send('{bad').expect(400);
  assert.equal(malformed.body.error.code, 'VALIDATION_ERROR');
  await request(app()).post('/api/auth/register').set('Origin', origin).send({ ...input, password: 'a'.repeat(9000) }).expect(413);
});
test('registration throttles repeated attempts even with spoofed forwarded IPs', async () => {
  const server = app();
  for (let i = 0; i < 5; i++) await request(server).post('/api/auth/register').set('Origin', origin).send({}).expect(400);
  const result = await request(server).post('/api/auth/register').set('Origin', origin).set('X-Forwarded-For', '203.0.113.1').send(input).expect(429);
  assert.ok(Number(result.headers['retry-after']) > 0);
});
