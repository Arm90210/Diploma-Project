import { Router } from 'express';
import type { SessionService } from '../auth/sessions.js';
import { requireSession } from '../auth/session-http.js';
export type UpdateProfile = (id: string, displayName: string) => Promise<NonNullable<Awaited<ReturnType<SessionService['currentUser']>>>>;
export function usersRouter(sessions: SessionService, update: UpdateProfile, origins: string[], secure: boolean) {
  const router = Router();
  router.patch('/me', requireSession(sessions, secure), async (req, res) => {
    if (!origins.includes(req.get('origin') ?? '')) { res.status(403).json({ error: 'Request origin is not allowed' }); return; }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Use application/json' }); return; }
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'displayName') || typeof body.displayName !== 'string' || !body.displayName.trim() || [...body.displayName.trim()].length > 100 || /[\u0000-\u001f\u007f]/u.test(body.displayName)) {
      res.status(400).json({ error: 'Display name must contain 1–100 characters without control characters' }); return;
    }
    res.json({ user: await update(res.locals.user.id, body.displayName.trim()) });
  });
  return router;
}
