import 'dotenv/config';
import { createApp } from './app.js';
import { db } from './db.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const app = createApp({ checkDatabase: async () => { await db.$queryRaw`SELECT 1`; } });
const server = app.listen(port, '127.0.0.1', () => console.log(`API: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  });
}
