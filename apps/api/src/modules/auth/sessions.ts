import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { accountFields } from './registration.js';
import { verifyPassword } from './password.js';

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'musicsphere_session';
export const validToken = (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token);
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
// A correctly formatted dummy hash makes unknown-account attempts pay the same scrypt cost.
const dummyHash = `scrypt$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function validateLogin(input: unknown): { email: string; password: string } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['email', 'password'].includes(key)) || typeof data.email !== 'string' || typeof data.password !== 'string') return null;
  const email = data.email.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || [...data.password].length < 1 || [...data.password].length > 128) return null;
  return { email, password: data.password };
}

export function sessionService(database: PrismaClient, now = () => new Date()) {
  return {
    async login(input: { email: string; password: string }, previousToken?: string) {
      const account = await database.user.findUnique({ where: { email: input.email }, select: { ...accountFields, passwordHash: true } });
      const matches = await verifyPassword(input.password, account?.passwordHash ?? dummyHash);
      if (!account || !matches) return null;
      const { passwordHash: _passwordHash, ...user } = account;
      const token = randomBytes(32).toString('hex');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
      // Revocation and issuance commit together; failed login never revokes an existing session.
      await database.$transaction(async tx => {
        if (validToken(previousToken)) await tx.session.deleteMany({ where: { tokenHash: tokenDigest(previousToken) } });
        await tx.session.create({ data: { userId: user.id, tokenHash: tokenDigest(token), createdAt, expiresAt } });
      });
      return { user, token, expiresAt };
    },
    async currentUser(token?: string) {
      if (!validToken(token)) return null;
      const session = await database.session.findUnique({ where: { tokenHash: tokenDigest(token) }, select: { expiresAt: true, user: { select: accountFields } } });
      return session && session.expiresAt > now() ? session.user : null;
    },
    async logout(token?: string) {
      if (validToken(token)) await database.session.deleteMany({ where: { tokenHash: tokenDigest(token) } });
    },
    async removeExpired() {
      return database.session.deleteMany({ where: { expiresAt: { lte: now() } } });
    },
  };
}
export type SessionService = ReturnType<typeof sessionService>;
