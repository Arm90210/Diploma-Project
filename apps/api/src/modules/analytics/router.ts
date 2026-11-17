import { Router } from 'express';
import { PulseError, type PulseService } from './service.js';

// Public, read-only aggregates. Suppression happens inside computePulse before any ranking,
// so no response contains numbers about a cohort below the threshold.
export function pulseRouter(pulse: PulseService) {
  const router = Router();
  const fail = (code: string, message: string) => ({ error: { code, message } });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', async (req, res) => {
    const { origin = 'REAL', region } = req.query;
    if (Object.keys(req.query).some(key => key !== 'origin' && key !== 'region') || (origin !== 'REAL' && origin !== 'SYNTHETIC') || (region !== undefined && (typeof region !== 'string' || !/^[A-Z]{2}$/.test(region)))) {
      res.status(400).json(fail('VALIDATION_ERROR', 'Use origin=REAL|SYNTHETIC and an optional two-letter region code')); return;
    }
    try { res.json({ pulse: await pulse.pulse(origin, (region as string | undefined) ?? null) }); }
    catch (error) {
      if (error instanceof PulseError) { res.status(error.code === 'NO_DATASET' ? 404 : 400).json(fail(error.code, error.message)); return; }
      throw error;
    }
  });
  router.get('/regions', async (_req, res) => { res.json({ regions: await pulse.regions() }); });
  return router;
}
