import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import type { SessionService } from '../auth/sessions.js';
import { requireSession } from '../auth/session-http.js';
import { isUuid, parseImport, parsePlaylistCreate } from './contract.js';
import { LibraryError, type LibraryService } from './service.js';

// Signed-in user's likes and playlists. The owner is always res.locals.user.id
// (from the session cookie); IDs in the URL only select which item to change.
export function libraryRouter(sessions: SessionService, library: LibraryService, allowedOrigins: string[], secureCookies: boolean) {
  const router = Router();
  const fail = (code: string, message: string) => ({ error: { code, message } });
  const trustedOrigin: RequestHandler = (req, res, next) => {
    if (!allowedOrigins.includes(req.get('origin') ?? '')) { res.status(403).json(fail('FORBIDDEN_ORIGIN', 'Request origin is not allowed')); return; }
    next();
  };
  const jsonOnly: RequestHandler = (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json(fail('UNSUPPORTED_MEDIA_TYPE', 'Use application/json')); return; }
    next();
  };
  // Validates every :param before any database work.
  const uuidParams: RequestHandler = (req, res, next) => {
    if (!Object.values(req.params).every(isUuid)) { res.status(400).json(fail('VALIDATION_ERROR', 'Use a valid ID')); return; }
    next();
  };
  const owner = (res: express.Response): string => res.locals.user.id;
  // Express 5 types params as string | string[] (for wildcard routes). These routes have
  // no wildcards and uuidParams has already verified every value is a UUID string.
  const param = (req: { params: Record<string, string | string[] | undefined> }, name: string): string => String(req.params[name]);
  router.use(requireSession(sessions, secureCookies));

  router.get('/', async (_req, res) => { res.json({ library: await library.get(owner(res)) }); });
  router.put('/likes/:trackId', trustedOrigin, uuidParams, async (req, res) => { await library.like(owner(res), param(req, 'trackId')); res.status(204).end(); });
  router.delete('/likes/:trackId', trustedOrigin, uuidParams, async (req, res) => { await library.unlike(owner(res), param(req, 'trackId')); res.status(204).end(); });
  router.post('/playlists', trustedOrigin, jsonOnly, express.json({ limit: '8kb' }), async (req, res) => {
    const input = parsePlaylistCreate(req.body);
    if (!input) { res.status(400).json(fail('VALIDATION_ERROR', 'Playlist name must contain 1–80 characters without control characters')); return; }
    res.status(201).json({ playlist: await library.createPlaylist(owner(res), input.title) });
  });
  router.delete('/playlists/:playlistId', trustedOrigin, uuidParams, async (req, res) => { await library.deletePlaylist(owner(res), param(req, 'playlistId')); res.status(204).end(); });
  router.put('/playlists/:playlistId/tracks/:trackId', trustedOrigin, uuidParams, async (req, res) => { await library.addTrack(owner(res), param(req, 'playlistId'), param(req, 'trackId')); res.status(204).end(); });
  router.delete('/playlists/:playlistId/tracks/:trackId', trustedOrigin, uuidParams, async (req, res) => { await library.removeTrack(owner(res), param(req, 'playlistId'), param(req, 'trackId')); res.status(204).end(); });
  router.post('/import', trustedOrigin, jsonOnly, express.json({ limit: '128kb' }), async (req, res) => {
    const input = parseImport(req.body);
    if (!input) { res.status(400).json(fail('VALIDATION_ERROR', 'Library import is malformed or too large')); return; }
    res.json(await library.importLibrary(owner(res), input));
  });

  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof LibraryError) {
      res.status(error.code === 'LIMIT' ? 409 : 404).json(fail(error.code, error.message)); return;
    }
    if (error?.status === 400 || error?.status === 413) {
      res.status(error.status).json(fail(error.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR', error.status === 413 ? 'Request too large' : 'Invalid JSON')); return;
    }
    next(error); // unexpected: the app's generic 500 handler, no details leaked
  };
  router.use(errors);
  return router;
}
