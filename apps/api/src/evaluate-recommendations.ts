import { writeFileSync } from 'node:fs';
import { evaluateRecommendations, recommendationReport } from './modules/recommend/evaluate.js';

// Usage: npm run recommend:evaluate -w apps/api — pure and in-memory (no database).
// Writes docs/EVALUATION-RECOMMENDATIONS.md; identical output for the same generator version and seed.
const report = evaluateRecommendations();
const target = new URL('../../../docs/EVALUATION-RECOMMENDATIONS.md', import.meta.url);
writeFileSync(target, recommendationReport(report));
console.log(`Test NDCG@10: cosine ${report.test.cosine.ndcg.toFixed(3)} vs popularity ${report.test.popularity.ndcg.toFixed(3)} (chosen k=${report.chosen.k}${report.chosen.fill ? ' + fill' : ''})`);
console.log(`Wrote ${target.pathname}`);
