import { usersRouter, type UpdateProfile } from './modules/users/router.js';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { authRouter } from './modules/auth/router.js';
import type { registrationService } from './modules/auth/registration.js';
import type { SessionService } from './modules/auth/sessions.js';
import { catalogRouter } from './modules/catalog/router.js';
import type { CatalogService } from './modules/catalog/service.js';
import { libraryRouter } from './modules/library/router.js';
import type { LibraryService } from './modules/library/service.js';
import { listeningRouter } from './modules/listening/router.js';
import type { ListeningService } from './modules/listening/service.js';
import { pulseRouter } from './modules/analytics/router.js';
import type { PulseService } from './modules/analytics/service.js';
import { locationRouter } from './modules/location/router.js';
import type { LocationService } from './modules/location/service.js';

type Dependencies = { updateProfile?: UpdateProfile; checkDatabase: () => Promise<void>; register?: ReturnType<typeof registrationService>; allowedOrigins?: string[]; sessions?: SessionService; secureCookies?: boolean; catalog?: CatalogService; library?: LibraryService; listening?: ListeningService; pulse?: PulseService; location?: LocationService };

// Inject the database check so HTTP behavior can be tested without PostgreSQL.
export function createApp({ checkDatabase, register, sessions, updateProfile, catalog, library, listening, pulse, location, secureCookies = process.env.NODE_ENV === 'production', allowedOrigins = [] }: Dependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  if (register || sessions) app.use('/api/auth', authRouter({ register, sessions, allowedOrigins, secureCookies }));
  // Before the global 32 KiB JSON parser: the library router sets its own per-route body limits.
  if (sessions && library) app.use('/api/library', libraryRouter(sessions, library, allowedOrigins, secureCookies));
  if (sessions && listening) app.use('/api/listening', listeningRouter(sessions, listening, allowedOrigins, secureCookies));
  app.use(express.json({ limit: '32kb' }));
  if (sessions && updateProfile) app.use('/api/users', usersRouter(sessions, updateProfile, allowedOrigins, secureCookies));
  if (catalog) app.use('/api/catalog', catalogRouter(catalog));
  if (pulse) app.use('/api/pulse', pulseRouter(pulse));
  if (sessions && location) app.use('/api/location', locationRouter(sessions, location, allowedOrigins, secureCookies));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'music-api', phase: 1 });
  });
  app.get('/api/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ready', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 400 ? 'Invalid JSON' : status === 413 ? 'Request too large' : 'Internal server error' });
  };
  app.use(errorHandler);
  return app;
}
