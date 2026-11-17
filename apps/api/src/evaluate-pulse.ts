import { writeFileSync } from 'node:fs';
import { evaluatePulse, reportMarkdown } from './modules/analytics/evaluate.js';

// Usage: npm run pulse:evaluate -w apps/api — pure and in-memory (no database).
// Writes docs/EVALUATION-PULSE.md; identical output for the same generator version and seed.
const report = evaluatePulse();
const target = new URL('../../../docs/EVALUATION-PULSE.md', import.meta.url);
writeFileSync(target, reportMarkdown(report));
console.log(`Precision@${report.K}: trend ${report.comparison.trend!.precisionAtK}, raw growth ${report.comparison.rawGrowth!.precisionAtK}, popularity ${report.comparison.popularity!.precisionAtK}`);
console.log(`Wrote ${target.pathname}`);
