import 'dotenv/config';
import { createApp } from './app.js';
import { db } from './db.js';
import { sessionService } from './modules/auth/sessions.js';
import { accountFields, registrationService } from './modules/auth/registration.js';
import { catalogService } from './modules/catalog/service.js';
import { libraryService } from './modules/library/service.js';
import { listeningService } from './modules/listening/service.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.APP_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.NODE_ENV === 'production' && (!allowedOrigins.length || allowedOrigins.some(value => { try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value; } catch { return true; } }))) throw new Error('APP_ORIGINS must list exact HTTPS origins in production');
const sessions = sessionService(db);
const app = createApp({ catalog: catalogService(db), library: libraryService(db), listening: listeningService(db), updateProfile: (id, displayName) => db.user.update({ where: { id }, data: { displayName }, select: accountFields }), sessions, register: registrationService(db), allowedOrigins, checkDatabase: async () => { await db.$queryRaw`SELECT 1`; } });
const server = app.listen(port, '127.0.0.1', () => console.log(`API: http://localhost:${port}`));
// Expiration is enforced on every request; cleanup only reclaims old rows.
const cleanup = () => { void sessions.removeExpired().catch(() => console.error('Expired-session cleanup failed')); };
cleanup();
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
cleanupTimer.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(cleanupTimer);
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  });
}
