import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosine, fitModel, neighbours, popular, preferenceVectors, recommend } from '../src/modules/recommend/model.js';
import { chronologicalSplit, metricsAtK, pairedBootstrap, evaluateRecommendations } from '../src/modules/recommend/evaluate.js';
import { DEFAULT_CONFIG, generateSynthetic } from '../src/modules/analytics/synthetic.js';
import type { EventRow } from '../src/modules/analytics/math.js';

const close = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);
const ev = (userId: string, trackId: string, day = 0): EventRow => ({ userId, trackId, at: Date.UTC(2026, 0, 1 + day, 12), regionId: null });

test('cosine: examples from MATHEMATICS.md, zero vectors, scale invariance', () => {
  const v = (entries: [string, number][]) => new Map(entries);
  close(cosine(v([['a', 3], ['b', 4]]), v([['a', 4], ['b', 3]])), 24 / 25);
  assert.equal(cosine(v([['a', 1]]), v([['b', 1]])), 0);
  assert.equal(cosine(v([]), v([['a', 1]])), 0);
  assert.equal(cosine(undefined, v([['a', 1]])), 0);
  close(cosine(v([['a', 1], ['b', 2]]), v([['a', 10], ['b', 20]])), 1);
});
test('preference vectors: fractional multi-genre allocation and the daily cap', () => {
  const genres = new Map([['t1', ['Jazz']], ['t2', ['Jazz', 'Indie']]]);
  const vectors = preferenceVectors([ev('u', 't1'), ev('u', 't2'), ...Array.from({ length: 5 }, () => ev('v', 't1'))], genres);
  assert.deepEqual(Object.fromEntries(vectors.get('u')!), { Jazz: 1.5, Indie: 0.5 });
  assert.deepEqual(Object.fromEntries(vectors.get('v')!), { Jazz: 3 }, 'five same-day listens count as three');
});
// Hand-worked fixture: genres J (jazz) and E (electronic).
const genres = new Map([['j1', ['J']], ['j2', ['J']], ['j3', ['J']], ['e1', ['E']], ['e2', ['E']]]);
const fixture = [
  ev('me', 'j1'),                                   // me: jazz only → vector (J:1)
  ev('a', 'j1'), ev('a', 'j2'),                     // a: (J:2) → sim 1
  ev('b', 'j1', 1), ev('b', 'e1', 1), ev('b', 'j3', 2), // b: (J:2, E:1) → sim 2/√5
  ev('c', 'e1'), ev('c', 'e2'),                     // c: (E:2) → sim 0, not a neighbour
];
test('neighbours: only positive similarity, sorted, capped at k', () => {
  const model = fitModel(fixture, genres);
  const near = neighbours(model, 'me', 20);
  assert.deepEqual(near.map(n => n.userId), ['a', 'b']);
  close(near[1]!.similarity, 2 / Math.sqrt(5));
  assert.deepEqual(neighbours(model, 'me', 1).map(n => n.userId), ['a']);
  assert.deepEqual(neighbours(model, 'nobody'), []);
});
test('score(u,t) = Σ sim·I(v heard t) / Σ sim, known tracks excluded', () => {
  const model = fitModel(fixture, genres);
  const list = recommend(model, 'me');
  const s = 1 + 2 / Math.sqrt(5);
  assert.deepEqual(list.map(r => r.trackId), ['j2', 'e1', 'j3']);
  close(list[0]!.score, 1 / s);                    // only a heard j2
  close(list[1]!.score, (2 / Math.sqrt(5)) / s);   // only b heard e1
  close(list[2]!.score, (2 / Math.sqrt(5)) / s);   // only b heard j3 (same score as e1)
  assert.ok(list.every(r => r.trackId !== 'j1' && r.reason === 'neighbours'));
});
test('ties: equal score sorts by training listeners, then track ID', () => {
  const model = fitModel(fixture, genres);
  const list = recommend(model, 'me');
  // j3 and e1 have the same score; e1 has 2 training listeners (b, c) vs j3's 1 (b) → e1 first.
  assert.deepEqual(list.slice(1).map(r => r.trackId), ['e1', 'j3']);
});
test('fallbacks: no history → popularity; too few neighbours → popularity; extra exclusions respected', () => {
  const model = fitModel(fixture, genres);
  const cold = recommend(model, 'newcomer');
  assert.ok(cold.length > 0 && cold.every(r => r.reason === 'popular'));
  assert.equal(cold[0]!.trackId, 'j1', 'j1 has the most training listeners (me, a, b)');
  assert.ok(recommend(model, 'me', { minNeighbours: 5 }).every(r => r.reason === 'popular'));
  assert.ok(!recommend(model, 'me', { exclude: ['j2'] }).some(r => r.trackId === 'j2'));
  assert.ok(!popular(model, new Set(['j1'])).some(r => r.trackId === 'j1'));
});
test('fill completes a short personal list with popular tracks', () => {
  const model = fitModel(fixture, genres);
  const filled = recommend(model, 'me', { fill: true, length: 4 });
  assert.equal(filled.length, 4);
  assert.deepEqual(filled.map(r => r.reason), ['neighbours', 'neighbours', 'neighbours', 'popular']);
  assert.equal(new Set(filled.map(r => r.trackId)).size, 4);
});
test('metrics: hand-worked precision, recall and NDCG at K', () => {
  const m = metricsAtK(['x', 'r1', 'y', 'r2'], new Set(['r1', 'r2', 'r3']), 10);
  close(m.precision, 2 / 10);  // denominator is K even for a short list
  close(m.recall, 2 / 3);
  close(m.ndcg, (1 / Math.log2(3) + 1 / Math.log2(5)) / (1 + 1 / Math.log2(3) + 1 / Math.log2(4)));
  assert.deepEqual(metricsAtK([], new Set(['r']), 10), { precision: 0, recall: 0, ndcg: 0, hits: 0 });
  close(metricsAtK(['r1', 'r2'], new Set(['r1', 'r2']), 10).ndcg, 1);
});
test('chronological split is ordered and exhaustive', () => {
  const events = Array.from({ length: 100 }, (_, i) => ({ at: 1000 - i }));
  const split = chronologicalSplit(events);
  assert.deepEqual([split.train.length, split.validation.length, split.test.length], [70, 10, 20]);
  assert.ok(Math.max(...split.train.map(e => e.at)) < Math.min(...split.validation.map(e => e.at)));
  assert.ok(Math.max(...split.validation.map(e => e.at)) < Math.min(...split.test.map(e => e.at)));
});
test('paired bootstrap is deterministic for a seed', () => {
  const a = [0.5, 0.4, 0.9, 0.1], b = [0.3, 0.4, 0.2, 0.1];
  assert.deepEqual(pairedBootstrap(a, b, 7, 200), pairedBootstrap(a, b, 7, 200));
  close(pairedBootstrap(a, b, 7, 200).mean, 0.225);
});
test('evaluation on the default synthetic dataset beats popularity with an interval above zero', () => {
  const report = evaluateRecommendations(generateSynthetic(DEFAULT_CONFIG), 200);
  assert.ok(report.test.cosine.ndcg > report.test.popularity.ndcg);
  assert.ok(report.intervals.ndcg.low > 0);
  assert.equal(report.split.train + report.split.validation + report.split.test, report.dataset.events);
});
