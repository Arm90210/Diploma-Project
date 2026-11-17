import { db } from './db.js';
import { replaceSyntheticDataset } from './modules/analytics/persist.js';
import { DEFAULT_CONFIG, generateSynthetic } from './modules/analytics/synthetic.js';

// Usage (repository root): npm run db:synthetic — replaces only SYNTHETIC rows; safe to repeat.
// The same generator version and seed always produce the same dataset.
try {
  const data = generateSynthetic(DEFAULT_CONFIG);
  const counts = await replaceSyntheticDataset(db, data);
  console.log(`Synthetic demonstration dataset ${data.meta.generatorVersion} (seed ${data.meta.seed}, reference date ${new Date(data.meta.referenceDate).toISOString().slice(0, 10)}): ${counts.users} users, ${counts.tracks} tracks, ${counts.events} events, ${counts.likes} likes.`);
} catch (error) {
  console.error('Generating the synthetic dataset failed. Is PostgreSQL running and are migrations applied (npm run db:migrate)?');
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
