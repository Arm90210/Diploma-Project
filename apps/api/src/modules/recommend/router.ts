import { Router } from 'express';
import type { SessionService } from '../auth/sessions.js';
import { requireSession } from '../auth/session-http.js';
import type { RecommendationService } from './service.js';

export function recommendationRouter(sessions: SessionService, recommendations: RecommendationService, secureCookies: boolean) {
  const router = Router();
  router.get('/', requireSession(sessions, secureCookies), async (req, res) => {
    const raw = req.query.limit;
    const limit = raw === undefined ? 10 : typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (Object.keys(req.query).some(key => key !== 'limit') || !(limit >= 1 && limit <= 20)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Limit must be an integer from 1 to 20' } }); return;
    }
    res.json(await recommendations.forUser(res.locals.user.id, limit));
  });
  return router;
}
