import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';

type Dependencies = { checkDatabase: () => Promise<void> };

// Inject the database check so HTTP behavior can be tested without PostgreSQL.
export function createApp({ checkDatabase }: Dependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));

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
