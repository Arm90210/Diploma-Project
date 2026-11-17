import { Router, type RequestHandler } from 'express';
import type { SessionService } from '../auth/sessions.js';
import { requireSession } from '../auth/session-http.js';
import { LocationError, type LocationService } from './service.js';

export function locationRouter(sessions: SessionService, location: LocationService, allowedOrigins: string[], secureCookies: boolean) {
  const router = Router();
  const fail = (code: string, message: string) => ({ error: { code, message } });
  const trustedOrigin: RequestHandler = (req, res, next) => {
    if (!allowedOrigins.includes(req.get('origin') ?? '')) { res.status(403).json(fail('FORBIDDEN_ORIGIN', 'Request origin is not allowed')); return; }
    next();
  };
  const owner = (res: { locals: Record<string, any> }): string => res.locals.user.id;
  router.use(requireSession(sessions, secureCookies));
  router.get('/', async (_req, res) => { res.json(await location.mine(owner(res))); });
  // Consent must be given explicitly with each choice: { code: "AM", consent: true }.
  router.put('/', trustedOrigin, async (req, res) => {
    if (!req.is('application/json')) { res.status(415).json(fail('UNSUPPORTED_MEDIA_TYPE', 'Use application/json')); return; }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 || body.consent !== true || typeof body.code !== 'string' || !/^[A-Z]{2}$/.test(body.code)) {
      res.status(400).json(fail('VALIDATION_ERROR', 'Choose a region and confirm consent')); return;
    }
    try { res.json(await location.choose(owner(res), body.code)); }
    catch (error) { if (error instanceof LocationError) { res.status(400).json(fail(error.code, error.message)); return; } throw error; }
  });
  router.delete('/', trustedOrigin, async (_req, res) => { res.json(await location.withdraw(owner(res))); });
  return router;
}
