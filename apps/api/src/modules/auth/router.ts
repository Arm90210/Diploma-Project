import { createHash } from 'node:crypto';
import express, { Router, type ErrorRequestHandler, type RequestHandler, type Response } from 'express';
import { AccountUnavailable, validateRegistration, type registrationService } from './registration.js';
import { SESSION_COOKIE, SESSION_LIFETIME_MS, validateLogin, type SessionService } from './sessions.js';
import { cookieOptions, readSessionCookie, requireSession } from './session-http.js';
import { attemptLimiter } from './limits.js';

type Options = {
  register?: ReturnType<typeof registrationService>;
  sessions?: SessionService;
  allowedOrigins: string[];
  secureCookies: boolean;
};
export function authRouter({ register, sessions, allowedOrigins, secureCookies }: Options) {
  const router = Router();
  const registrationLimit = attemptLimiter(5);
  const loginIpLimit = attemptLimiter(30);
  const loginAccountLimit = attemptLimiter(10);
  let activeHashes = 0;
  const limited = (res: Response, seconds: number) => {
    res.set('Retry-After', String(seconds));
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Try again later' } });
  };
  const trustedOrigin: RequestHandler = (req, res, next) => {
    if (!allowedOrigins.includes(req.get('origin') ?? '')) {
      res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Request origin is not allowed' } }); return;
    }
    next();
  };
  const jsonOnly: RequestHandler = (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } }); return;
    }
    next();
  };
  const ipLimit = (take: ReturnType<typeof attemptLimiter>): RequestHandler => (req, res, next) => {
    const wait = take(req.ip ?? 'unknown');
    if (wait) { limited(res, wait); return; }
    next();
  };
  // Shared bound across registration and login: at most two scrypt operations per app.
  async function withHashSlot(res: Response, operation: () => Promise<void>) {
    if (activeHashes >= 2) { limited(res, 1); return; }
    activeHashes++;
    try { await operation(); } finally { activeHashes--; }
  }
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (register) router.post('/register', trustedOrigin, ipLimit(registrationLimit), jsonOnly, express.json({ limit: '8kb' }), async (req, res) => {
    const input = validateRegistration(req.body);
    if (!input) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email, username (3–40 letters, digits or underscores), display name (1–100 characters), and password (15–128 characters)' } }); return; }
    await withHashSlot(res, async () => {
      try { res.status(201).json({ user: await register(input) }); }
      catch (error) {
        if (error instanceof AccountUnavailable) res.status(409).json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account details are unavailable' } });
        else throw error;
      }
    });
  });
  if (sessions) {
    router.post('/login', trustedOrigin, ipLimit(loginIpLimit), jsonOnly, express.json({ limit: '8kb' }), async (req, res) => {
      const input = validateLogin(req.body);
      if (!input) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide email and password' } }); return; }
      const wait = loginAccountLimit(createHash('sha256').update(input.email).digest('hex'));
      if (wait) { limited(res, wait); return; }
      await withHashSlot(res, async () => {
        const result = await sessions.login(input, readSessionCookie(req.get('cookie')));
        if (!result) { res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } }); return; }
        res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions(secureCookies), maxAge: SESSION_LIFETIME_MS });
        res.json({ user: result.user });
      });
    });
    router.get('/me', requireSession(sessions, secureCookies), (_req, res) => { res.json({ user: res.locals.user }); });
    router.post('/logout', trustedOrigin, jsonOnly, express.json({ limit: '8kb' }), async (req, res) => {
      await sessions.logout(readSessionCookie(req.get('cookie')));
      res.clearCookie(SESSION_COOKIE, cookieOptions(secureCookies));
      res.status(204).end();
    });
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).json({ error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: 'Unable to process request' } });
  };
  router.use(errors);
  return router;
}
