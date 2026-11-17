import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, capDaily, genreDistribution, movingAverage, percentileRanks, totalVariation, trendScores, weeklyWindows, type EventRow } from '../src/modules/analytics/math.js';

const close = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);
const ev = (userId: string, trackId: string, at: number): EventRow => ({ userId, trackId, at, regionId: null });

test('weekly windows are equal, adjacent, complete UTC weeks ending at midnight', () => {
  const end = Date.UTC(2026, 10, 16, 15, 30); // mid-day → the window closes at that day's midnight
  const { current, previous } = weeklyWindows(end);
  assert.equal(current.end, Date.UTC(2026, 10, 16));
  assert.equal(current.start, Date.UTC(2026, 10, 9));
  assert.equal(previous.end, current.start);
  assert.equal(previous.end - previous.start, 7 * DAY_MS);
});
test('daily cap keeps the first three events per user/track/UTC day', () => {
  const day = Date.UTC(2026, 0, 1);
  const events = [5, 1, 4, 2, 3].map(hour => ev('u', 't', day + hour * 3600_000)).concat([ev('u', 't', day + DAY_MS), ev('v', 't', day)]);
  const kept = capDaily(events);
  assert.equal(kept.filter(e => e.userId === 'u' && e.at < day + DAY_MS).length, 3);
  assert.deepEqual(kept.filter(e => e.userId === 'u' && e.at < day + DAY_MS).map(e => (e.at - day) / 3600_000), [1, 2, 3]);
  assert.equal(kept.length, 5); // plus next day's event and the other user's
});
test('genre distribution uses fractional multi-genre counts and reports uncategorized events', () => {
  const genres = new Map([['a', ['Jazz']], ['b', ['Jazz', 'Indie']], ['c', []]]);
  const result = genreDistribution([ev('u', 'a', 0), ev('u', 'b', 0), ev('v', 'c', 0)], genres);
  assert.deepEqual(result.counts, { Jazz: 1.5, Indie: 0.5 });
  assert.equal(result.uncategorized, 1);
  close(result.shares.Jazz!, 0.75); close(result.shares.Indie!, 0.25);
  close(Object.values(result.shares).reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(genreDistribution([], genres).shares, {});
});
test('total variation distance: examples from MATHEMATICS.md and boundary cases', () => {
  close(totalVariation({ A: 0.7, B: 0.3 }, { A: 0.2, B: 0.8 }), 0.5);
  close(totalVariation({ A: 0.4, B: 0.6 }, { A: 0.4, B: 0.6 }), 0);
  close(totalVariation({ A: 1 }, { B: 1 }), 1);            // disjoint
  close(totalVariation({ A: 0.5, B: 0.5 }, { A: 1 }), 0.5);  // missing genre counts as 0
});
test('percentile ranks average ties; all equal or single value gives 0.5', () => {
  assert.deepEqual(percentileRanks([10, 30, 20]), [0, 1, 0.5]);
  assert.deepEqual(percentileRanks([5, 5, 5, 5]), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(percentileRanks([7]), [0.5]);
  assert.deepEqual(percentileRanks([1, 2, 2, 3]), [0, 0.5, 0.5, 1]);
});
test('trend score: eligibility, smoothed growth, new entries, renormalized weights, hand-worked value', () => {
  const rows = [
    { trackId: 'steady', U0: 100, U1: 100, likers: 10, repeaters: 30 },
    { trackId: 'rising', U0: 20, U1: 60, likers: 12, repeaters: 30 },
    { trackId: 'new', U0: 0, U1: 25, likers: 0, repeaters: 5 },
    { trackId: 'tiny', U0: 1, U1: 15, likers: 10, repeaters: 15 }, // ineligible despite huge raw growth
  ];
  const result = trendScores(rows);
  assert.deepEqual(result.map(r => r.trackId).sort(), ['new', 'rising', 'steady']);
  const rising = result.find(r => r.trackId === 'rising')!;
  close(rising.growth, (60 - 20) / (20 + 20));
  close(rising.rawGrowth!, 2);
  const fresh = result.find(r => r.trackId === 'new')!;
  assert.equal(fresh.newEntry, true); assert.equal(fresh.rawGrowth, null);
  // Playlist signal unavailable → weights renormalized over growth/like/repeat (0.55/0.85, 0.20/0.85, 0.10/0.85).
  close(rising.weights.growth!, 0.55 / 0.85); close(rising.weights.likeRate!, 0.20 / 0.85); close(rising.weights.repeatRate!, 0.10 / 0.85);
  assert.equal(rising.weights.playlistAddRate, undefined); assert.equal(rising.playlistAddRate, null);
  // Hand-worked: growth g = steady 0, rising 1, new 1.25 → percentiles 0, 0.5, 1.
  // like rate = 0.1, 0.2, 0 → 0.5, 1, 0. repeat rate = 0.3, 0.5, 0.2 → 0.5, 1, 0.
  // rising: 100 · 60/110 · (0.55·0.5 + 0.20·1 + 0.10·1)/0.85
  close(rising.score, 100 * (60 / 110) * (0.55 * 0.5 + 0.20 * 1 + 0.10 * 1) / 0.85);
  assert.equal(result[0]!.trackId, 'rising');
  assert.deepEqual(trendScores([]), []);
});
test('trend score includes the playlist signal when every eligible track has it', () => {
  const result = trendScores([{ trackId: 'a', U0: 20, U1: 30, likers: 3, repeaters: 3, playlistAdders: 3 }, { trackId: 'b', U0: 20, U1: 30, likers: 3, repeaters: 3, playlistAdders: 6 }]);
  close(Object.values(result[0]!.weights).reduce((a, b) => a + b!, 0), 1);
  assert.equal(result[0]!.trackId, 'b');
});
test('moving average', () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4], 3), [null, null, 2, 3]);
  assert.deepEqual(movingAverage([7, 7, 7, 7, 7, 7, 7]).at(-1), 7);
});
