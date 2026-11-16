import { Router } from 'express';
import { parseTrackQuery, parseTrackRef } from './contract.js';
import type { CatalogService } from './service.js';

// Public, read-only catalog. No session needed; it exposes no user data.
export function catalogRouter(catalog: CatalogService) {
  const router = Router();
  const invalid = (message: string) => ({ error: { code: 'VALIDATION_ERROR', message } });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
  router.get('/tracks', async (req, res) => {
    const query = parseTrackQuery(req.query as Record<string, unknown>);
    if (!query.ok) { res.status(400).json(invalid(query.message)); return; }
    res.json(await catalog.listTracks(query.value));
  });
  router.get('/tracks/:ref', async (req, res) => {
    const ref = parseTrackRef(req.params.ref ?? '');
    if (!ref) { res.status(400).json(invalid('Use a track ID or slug')); return; }
    const track = await catalog.getTrack(ref);
    if (!track) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Track not found' } }); return; }
    res.json({ track });
  });
  router.get('/genres', async (_req, res) => { res.json({ genres: await catalog.listGenres() }); });
  return router;
}
