import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { computePulse, type PulseInput } from '../src/modules/analytics/pulse.js';
import { DEFAULT_CONFIG, generateSynthetic, SYNTHETIC_REGIONS } from '../src/modules/analytics/synthetic.js';
import { evaluatePulse, pulseInputFrom } from '../src/modules/analytics/evaluate.js';
import { DAY_MS } from '../src/modules/analytics/math.js';

const small = { ...DEFAULT_CONFIG, users: 150, days: 28 };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('synthetic generator is deterministic for a seed and changes with the seed', () => {
  const a = generateSynthetic(small), b = generateSynthetic(small), c = generateSynthetic({ ...small, seed: small.seed + 1 });
  assert.equal(digest(a), digest(b));
  assert.notEqual(digest(a), digest(c));
});
test('synthetic data has the planted structure and valid values', () => {
  const data = generateSynthetic(small);
  assert.equal(data.tracks.length, 36);
  assert.deepEqual(Object.fromEntries(Object.entries(data.truth.roles).map(([role, ids]) => [role, ids.length])), { breakout: 3, steady: 4, spike: 1, tiny: 1, normal: 27 });
  const start = small.referenceDate - small.days * DAY_MS;
  assert.ok(data.events.every(event => event.at >= start && event.at < small.referenceDate));
  assert.ok(data.events.every(event => event.completion > 0 && event.completion <= 1 && event.listenedMs > 0));
  assert.equal(new Set(data.events.map(event => event.sessionId)).size, data.events.length, 'one event per session');
  assert.equal(new Set(data.users.map(user => user.regionCode)).size, SYNTHETIC_REGIONS.length);
  for (const region of SYNTHETIC_REGIONS) assert.ok(Math.abs(Object.values(region.prefs).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  assert.equal(new Set(data.likes.map(like => `${like.userId}|${like.trackId}`)).size, data.likes.length, 'at most one like per user/track');
});
test('pulse suppresses small cohorts entirely, including per-day values and previous-week counts', () => {
  const data = generateSynthetic(small);
  const hidden = computePulse({ ...pulseInputFrom(data, small.referenceDate, 'AM'), minimumListeners: 100_000 });
  assert.equal(hidden.suppressed, true);
  assert.deepEqual([hidden.summary, hidden.genres, hidden.daily, hidden.trending, hidden.popular], [null, null, null, [], []]);
  assert.ok(hidden.regions.every(region => region.suppressed && region.listeners === null && region.shares === null && region.distance === null));
  const shown = computePulse(pulseInputFrom(data, small.referenceDate, 'DE'));
  assert.equal(shown.suppressed, false);
  assert.equal(shown.label, 'Synthetic demonstration');
  assert.ok(shown.daily!.every(day => day.listeners === null || day.listeners >= 10));
  assert.ok(shown.popular.every(row => row.listeners >= 10));
  assert.ok(Math.abs(shown.genres!.shares.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-9);
  assert.equal(shown.regions.find(region => region.code === 'DE')!.distance, 0, 'distance of a region to itself');
});
test('a region filter only counts events snapshotted in that region', () => {
  const input: PulseInput = {
    origin: 'REAL', end: Date.UTC(2026, 0, 15), regions: [{ id: 'r1', code: 'AM', name: 'Armenia' }], regionCode: 'AM',
    events: Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}`, trackId: 't', at: Date.UTC(2026, 0, 12), regionId: i < 9 ? 'r1' : null })),
    likes: [], tracks: new Map(), trackGenres: new Map([['t', ['Jazz']]]),
  };
  assert.equal(computePulse(input).suppressed, true, '9 consented listeners in Armenia < 10');
  assert.equal(computePulse({ ...input, regionCode: null }).summary!.listeners, 12, 'all regions includes listeners without a region');
  assert.equal(computePulse({ ...input, regionCode: null }).label, 'Our platform');
});
test('evaluation recovers the planted breakouts better than raw growth and popularity', () => {
  const report = evaluatePulse(undefined, 20);
  assert.equal(report.comparison.trend!.precisionAtK, 1);
  assert.ok(report.comparison.trend!.precisionAtK > report.comparison.rawGrowth!.precisionAtK);
  assert.ok(report.comparison.trend!.precisionAtK > report.comparison.popularity!.precisionAtK);
  assert.equal(report.comparison.trend!.tinyRank, null, 'tiny-denominator track is not eligible');
  assert.ok(report.regional.every(row => row.tvToTruth < 0.1));
  assert.ok(Math.abs(report.mechanism.withoutReplaysOrSpike - report.mechanism.trueMean) < 0.02);
  assert.deepEqual(report.suppressionCheck, { suppressed: true, summaryHidden: true, trendingHidden: true });
});
