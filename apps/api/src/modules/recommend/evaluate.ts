// Chronological evaluation of recommendations (docs/MATHEMATICS.md section 1 "Evaluation").
// Pure and in-memory. Everything is fitted on the training period only; the neighbour count and
// the fill variant are chosen on validation; the test period is scored once with that choice.
import type { EventRow } from '../analytics/math.js';
import { DEFAULT_CONFIG, generateSynthetic, prng, type SyntheticDataset } from '../analytics/synthetic.js';
import { fitModel, popular, recommend, type Model, type Recommendation } from './model.js';

export const K = 10;
export const SPLIT = { train: 0.7, validation: 0.1, test: 0.2 } as const;

/** Precision@K (denominator K), Recall@K (denominator |relevant|), NDCG@K with binary relevance. */
export function metricsAtK(recommended: string[], relevant: Set<string>, k = K) {
  const top = recommended.slice(0, k);
  let hits = 0, dcg = 0;
  top.forEach((track, index) => { if (relevant.has(track)) { hits++; dcg += 1 / Math.log2(index + 2); } });
  let ideal = 0;
  for (let index = 0; index < Math.min(relevant.size, k); index++) ideal += 1 / Math.log2(index + 2);
  return { precision: hits / k, recall: relevant.size ? hits / relevant.size : 0, ndcg: ideal ? dcg / ideal : 0, hits };
}

/** One global chronological split by event time: earliest 70% / next 10% / latest 20%. */
export function chronologicalSplit<T extends { at: number }>(events: T[]) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const trainEnd = sorted[Math.floor(sorted.length * SPLIT.train)]!.at;
  const validationEnd = sorted[Math.floor(sorted.length * (SPLIT.train + SPLIT.validation))]!.at;
  return {
    boundaries: { trainEnd, validationEnd },
    train: sorted.filter(event => event.at < trainEnd),
    validation: sorted.filter(event => event.at >= trainEnd && event.at < validationEnd),
    test: sorted.filter(event => event.at >= validationEnd),
  };
}

type Method = (model: Model, userId: string) => Recommendation[];
type Scored = { userId: string; coldStart: boolean; relevant: number; precision: number; recall: number; ndcg: number; personal: boolean; tracks: string[] };

/** Relevant = tracks in the user's held-out events that were unseen in training and are in the training catalog. */
export function scoreMethod(model: Model, heldOut: EventRow[], method: Method): { users: Scored[]; excludedUsers: number; newTracks: number } {
  const byUser = new Map<string, Set<string>>();
  let newTracks = 0;
  const unseenCatalog = new Set<string>();
  for (const event of heldOut) {
    if (!model.catalog.has(event.trackId)) { unseenCatalog.add(event.trackId); continue; }
    if (model.heard.get(event.userId)?.has(event.trackId)) continue;
    byUser.set(event.userId, (byUser.get(event.userId) ?? new Set()).add(event.trackId));
  }
  newTracks = unseenCatalog.size;
  const everyone = new Set(heldOut.map(event => event.userId));
  const users = [...byUser].sort(([a], [b]) => a.localeCompare(b)).map(([userId, relevant]) => {
    const list = method(model, userId);
    const tracks = list.map(item => item.trackId);
    return { userId, coldStart: !model.heard.has(userId), relevant: relevant.size, ...metricsAtK(tracks, relevant), personal: list.some(item => item.reason === 'neighbours'), tracks };
  });
  return { users, excludedUsers: everyone.size - users.length, newTracks };
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export function summarize(scored: Scored[], catalogSize: number) {
  return {
    users: scored.length,
    precision: mean(scored.map(user => user.precision)), recall: mean(scored.map(user => user.recall)), ndcg: mean(scored.map(user => user.ndcg)),
    userCoverage: mean(scored.map(user => user.tracks.length > 0 ? 1 : 0)),
    personalised: mean(scored.map(user => user.personal ? 1 : 0)),
    catalogCoverage: catalogSize ? new Set(scored.flatMap(user => user.tracks.slice(0, K))).size / catalogSize : 0,
  };
}

/** Paired bootstrap over users (fixed seed): 95% interval of mean(metric_A − metric_B). */
export function pairedBootstrap(a: number[], b: number[], seed: number, resamples = 1000) {
  const random = prng(seed);
  const differences = a.map((value, index) => value - b[index]!);
  const means = Array.from({ length: resamples }, () => mean(differences.map(() => differences[Math.floor(random() * differences.length)]!))).sort((x, y) => x - y);
  return { mean: mean(differences), low: means[Math.floor(resamples * 0.025)]!, high: means[Math.floor(resamples * 0.975)]! };
}

export function evaluateRecommendations(data: SyntheticDataset = generateSynthetic(DEFAULT_CONFIG), resamples = 1000) {
  const genres = new Map(data.tracks.map(track => [track.id, [track.genre]]));
  const events: EventRow[] = data.events.map(event => ({ userId: event.userId, trackId: event.trackId, at: event.at, regionId: event.regionCode }));
  const split = chronologicalSplit(events);
  // Training catalog: tracks that exist (have been listened to) before the training cut-off.
  const model = fitModel(split.train, genres);
  const popularity: Method = (m, user) => popular(m, m.heard.get(user) ?? new Set());

  // Validation: choose neighbour count and fill variant by mean NDCG@10 (ties → fewer neighbours, no fill).
  const grid = [5, 10, 20, 40].flatMap(k => [false, true].map(fill => ({ k, fill })));
  const validation = grid.map(config => {
    const result = scoreMethod(model, split.validation, (m, user) => recommend(m, user, config));
    return { ...config, ...summarize(result.users, model.catalog.size) };
  });
  const baselineValidation = summarize(scoreMethod(model, split.validation, popularity).users, model.catalog.size);
  const chosen = [...validation].sort((a, b) => b.ndcg - a.ndcg || a.k - b.k || Number(a.fill) - Number(b.fill))[0]!;

  // Test, once, with the chosen configuration.
  const cosineTest = scoreMethod(model, split.test, (m, user) => recommend(m, user, { k: chosen.k, fill: chosen.fill }));
  const popularTest = scoreMethod(model, split.test, popularity);
  const cosineSummary = summarize(cosineTest.users, model.catalog.size), popularSummary = summarize(popularTest.users, model.catalog.size);
  const intervals = {
    ndcg: pairedBootstrap(cosineTest.users.map(u => u.ndcg), popularTest.users.map(u => u.ndcg), data.meta.seed + 2, resamples),
    precision: pairedBootstrap(cosineTest.users.map(u => u.precision), popularTest.users.map(u => u.precision), data.meta.seed + 3, resamples),
    recall: pairedBootstrap(cosineTest.users.map(u => u.recall), popularTest.users.map(u => u.recall), data.meta.seed + 4, resamples),
  };
  const coldUsers = cosineTest.users.filter(user => user.coldStart);
  const iso = (time: number) => new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  return {
    dataset: { generatorVersion: data.meta.generatorVersion, seed: data.meta.seed, users: data.users.length, tracks: data.tracks.length, events: events.length },
    split: { trainEnd: iso(split.boundaries.trainEnd), validationEnd: iso(split.boundaries.validationEnd), train: split.train.length, validation: split.validation.length, test: split.test.length },
    trainingCatalog: model.catalog.size, newTracksExcluded: cosineTest.newTracks, excludedUsers: cosineTest.excludedUsers,
    validation, baselineValidation, chosen: { k: chosen.k, fill: chosen.fill },
    test: { cosine: cosineSummary, popularity: popularSummary }, intervals,
    coldStart: { users: coldUsers.length, coverage: coldUsers.length ? mean(coldUsers.map(user => user.tracks.length ? 1 : 0)) : null },
  };
}

export function recommendationReport(report: ReturnType<typeof evaluateRecommendations>): string {
  const f = (value: number) => value.toFixed(3);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const row = (name: string, s: ReturnType<typeof summarize>) => `| ${name} | ${s.users} | ${f(s.precision)} | ${f(s.recall)} | ${f(s.ndcg)} | ${pct(s.userCoverage)} | ${pct(s.personalised)} | ${pct(s.catalogCoverage)} |`;
  const ci = (name: string, x: { mean: number; low: number; high: number }) => `| ${name} | ${f(x.mean)} | [${f(x.low)}, ${f(x.high)}] |`;
  return [
    '# Recommendation evaluation on synthetic data', '',
    `Generated by \`npm run recommend:evaluate -w apps/api\` (pure, in-memory; no database). Dataset \`${report.dataset.generatorVersion}\`, seed ${report.dataset.seed}: ${report.dataset.users} users, ${report.dataset.tracks} tracks, ${report.dataset.events} counted events. Everything here is **synthetic demonstration data**; it verifies that the method behaves as designed, not how real listeners respond.`, '',
    '## Protocol', '',
    `One global chronological split by event time: training before ${report.split.trainEnd} UTC (${report.split.train} events), validation until ${report.split.validationEnd} UTC (${report.split.validation}), test after (${report.split.test}). Taste vectors, neighbours, popularity and the training catalog (${report.trainingCatalog} tracks) use training data only. Relevant tracks = tracks in a user's held-out events that the user had not heard in training. Tracks first appearing after training: ${report.newTracksExcluded} (excluded). Users with held-out events but no eligible relevant track: ${report.excludedUsers} (excluded). Metrics at K = ${K}; Precision@10 always divides by 10.`, '',
    '## Validation (model selection)', '',
    'Neighbour count k and whether to fill a short personal list with popular tracks, chosen by mean NDCG@10 on validation only.', '',
    '| Configuration | Users | Precision@10 | Recall@10 | NDCG@10 | User coverage | Personalised | Catalog coverage |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.validation.map(v => row(`cosine k=${v.k}${v.fill ? ' + fill' : ''}`, v)), row('popularity baseline', report.baselineValidation), '',
    `Chosen: **k = ${report.chosen.k}${report.chosen.fill ? ', with popularity fill' : ', no fill'}**.`, '',
    '## Test (reported once)', '',
    '| Method | Users | Precision@10 | Recall@10 | NDCG@10 | User coverage | Personalised | Catalog coverage |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    row(`cosine neighbours (k=${report.chosen.k}${report.chosen.fill ? ' + fill' : ''})`, report.test.cosine), row('popularity baseline', report.test.popularity), '',
    'Paired bootstrap over users (1 000 resamples, fixed seed): difference cosine − popularity.', '',
    '| Metric | Mean difference | 95% interval |', '| --- | --- | --- |',
    ci('NDCG@10', report.intervals.ndcg), ci('Precision@10', report.intervals.precision), ci('Recall@10', report.intervals.recall), '',
    `Cold-start users (no training history) in the test set: ${report.coldStart.users}${report.coldStart.coverage === null ? ' — every synthetic user is active from the first week, so the cold-start path (popularity fallback) is covered by unit tests, not by this dataset.' : `, coverage ${pct(report.coldStart.coverage)}.`}`, '',
    '## Interpretation limits', '',
    'The generator plants genre preferences, so genre-based neighbours have a structural advantage here; a real catalogue with richer taste would test the method harder. The catalogue is small (36 tracks) and users have already heard many of them, so K = 10 covers a large share of the remaining candidates and recall is high for both methods. Tracks that surge only after the training period (the planted breakouts) are hard for both methods, because both learn from training data only. Validation differences between neighbour counts of 20 and 40 are small, so the choice is not sharply determined. Relevance comes from listening only (no ratings). Results come from one seed; the bootstrap reflects user sampling, not generator randomness.', '',
  ].join('\n');
}
