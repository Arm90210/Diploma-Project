import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import type { SessionService } from '../auth/sessions.js';
import { readSessionCookie, requireSession } from '../auth/session-http.js';
import { parseHeartbeat, parseStart } from './policy.js';
import { ListeningError, type ListeningService } from './service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Playback sessions, heartbeats, personal history and per-track audience numbers.
// The user is always taken from the session cookie; bodies never carry identity,
// time, origin or region.
export function listeningRouter(sessions: SessionService, listening: ListeningService, allowedOrigins: string[], secureCookies: boolean) {
  const router = Router();
  const fail = (code: string, message: string) => ({ error: { code, message } });
  const signedIn = requireSession(sessions, secureCookies);
  const trustedOrigin: RequestHandler = (req, res, next) => {
    if (!allowedOrigins.includes(req.get('origin') ?? '')) { res.status(403).json(fail('FORBIDDEN_ORIGIN', 'Request origin is not allowed')); return; }
    next();
  };
  const json: RequestHandler[] = [
    (req, res, next) => { if (!req.is('application/json')) { res.status(415).json(fail('UNSUPPORTED_MEDIA_TYPE', 'Use application/json')); return; } next(); },
    express.json({ limit: '2kb' }),
  ];
  // Express 5 types params as string | string[]; these routes have no wildcards.
  const param = (req: { params: Record<string, string | string[] | undefined> }, name: string) => String(req.params[name]);
  const uuidParams: RequestHandler = (req, res, next) => {
    if (!Object.values(req.params).every(value => typeof value === 'string' && UUID.test(value))) { res.status(400).json(fail('VALIDATION_ERROR', 'Use a valid ID')); return; }
    next();
  };
  const owner = (res: express.Response): string => res.locals.user.id;
  const invalid = (res: express.Response) => res.status(400).json(fail('VALIDATION_ERROR', 'Heartbeat must be { sequence ≥ 1, positionMs ≥ 0, playing } as integers/boolean'));

  router.post('/sessions', signedIn, trustedOrigin, ...json, async (req, res) => {
    const input = parseStart(req.body);
    if (!input) { res.status(400).json(fail('VALIDATION_ERROR', 'Provide a track ID and a known source')); return; }
    res.status(201).json({ session: await listening.start(owner(res), input.trackId, input.source) });
  });
  router.post('/sessions/:sessionId/heartbeats', signedIn, trustedOrigin, uuidParams, ...json, async (req, res) => {
    const beat = parseHeartbeat(req.body);
    if (!beat) { invalid(res); return; }
    res.json({ session: await listening.heartbeat(owner(res), param(req, 'sessionId'), beat) });
  });
  // Body is either {} or a final heartbeat.
  router.post('/sessions/:sessionId/end', signedIn, trustedOrigin, uuidParams, ...json, async (req, res) => {
    const empty = req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0;
    const beat = empty ? null : parseHeartbeat(req.body);
    if (!empty && !beat) { invalid(res); return; }
    res.json({ session: await listening.end(owner(res), param(req, 'sessionId'), beat) });
  });
  router.get('/history', signedIn, async (req, res) => {
    const keys = Object.keys(req.query);
    const raw = req.query.limit;
    const limit = raw === undefined ? 20 : typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (keys.some(key => key !== 'limit') || !(limit >= 1 && limit <= 50)) { res.status(400).json(fail('VALIDATION_ERROR', 'Limit must be an integer from 1 to 50')); return; }
    res.json(await listening.history(owner(res), limit));
  });
  // Public; a valid session cookie only adds the caller's own count.
  router.get('/tracks/:trackId/stats', uuidParams, async (req, res) => {
    const user = await sessions.currentUser(readSessionCookie(req.get('cookie')));
    res.set('Cache-Control', 'no-store');
    res.json({ stats: await listening.trackStats(param(req, 'trackId'), user?.id ?? null) });
  });

  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof ListeningError) {
      const status = { NOT_FOUND: 404, TRACK_NOT_FOUND: 404, CLOSED: 409, ORIGIN_MISMATCH: 409, RATE_LIMITED: 429 }[error.code];
      if (error.code === 'RATE_LIMITED') res.set('Retry-After', '60');
      res.status(status).json(fail(error.code, error.message)); return;
    }
    if (error?.status === 400 || error?.status === 413) { res.status(error.status).json(fail(error.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', error.status === 413 ? 'Request too large' : 'Invalid JSON')); return; }
    next(error);
  };
  router.use(errors);
  return router;
}
