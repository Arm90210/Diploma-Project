import type { CookieOptions, RequestHandler } from 'express';
import { SESSION_COOKIE, validToken, type SessionService } from './sessions.js';

export function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
}
// Tokens use only lowercase hex. Reject ambiguous duplicate cookies and malformed values.
export function readSessionCookie(header?: string): string | undefined {
  const values = (header ?? '').split(';').map(part => part.trim()).filter(part => part.split('=', 1)[0] === SESSION_COOKIE);
  if (values.length !== 1) return undefined;
  const token = values[0]!.slice(SESSION_COOKIE.length + 1);
  return validToken(token) ? token : undefined;
}
export function requireSession(sessions: SessionService, secureCookies: boolean): RequestHandler {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const user = await sessions.currentUser(readSessionCookie(req.get('cookie')));
    if (!user) {
      res.clearCookie(SESSION_COOKIE, cookieOptions(secureCookies));
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
      return;
    }
    res.locals.user = user;
    next();
  };
}
