import type { Prisma } from '@prisma/client';
import { hashPassword } from './password.js';

export type Registration = { email: string; username: string; displayName: string; password: string };
export class AccountUnavailable extends Error {}
export function validateRegistration(input: unknown): Registration | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const keys = ['email', 'username', 'displayName', 'password'];
  if (Object.keys(data).some(key => !keys.includes(key)) || keys.some(key => typeof data[key] !== 'string')) return null;
  const email = (data.email as string).trim().toLowerCase();
  const username = (data.username as string).trim().toLowerCase();
  const displayName = (data.displayName as string).trim();
  const password = data.password as string;
  const [local, domain, extra] = email.split('@');
  if (email.length > 254 || !local || local.length > 64 || !domain || extra !== undefined || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!domain.includes('.') || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (!/^[a-z0-9_]{3,40}$/.test(username) || !displayName || displayName.length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(displayName)) return null;
  if ([...password].length < 15 || [...password].length > 128) return null;
  return { email, username, displayName, password };
}
export const accountFields = { id: true, email: true, username: true, displayName: true, createdAt: true } as const;
export function registrationService(database: Pick<Prisma.TransactionClient, 'user'>) {
  return async ({ password, ...profile }: Registration) => {
    const passwordHash = await hashPassword(password);
    try {
      return await database.user.create({ data: { ...profile, passwordHash }, select: accountFields });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AccountUnavailable();
      throw error;
    }
  };
}
