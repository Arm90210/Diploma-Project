import { db } from './db.js';
import { seedRegions } from './modules/analytics/persist.js';
import { seedDemoCatalog } from './modules/catalog/seed.js';

// Usage (repository root): npm run db:seed — safe to repeat.
try {
  const result = await seedDemoCatalog(db);
  await seedRegions(db);
  console.log(`Demo catalog ready: ${result.tracks} tracks (${result.created} created, ${result.updated} updated). Regions ready.`);
} catch (error) {
  console.error('Seeding failed. Is PostgreSQL running and are migrations applied (npm run db:migrate)?');
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
