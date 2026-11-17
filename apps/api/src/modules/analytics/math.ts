// Music Pulse formulas (docs/MATHEMATICS.md sections 2–3). Pure and unit-tested:
// no database, clock or HTTP. Times are UTC milliseconds; windows are half-open [start, end).

export const DAY_MS = 86_400_000;
export const MIN_COHORT_LISTENERS = 10;   // privacy suppression threshold (ARCHITECTURE.md)
export const MIN_TREND_LISTENERS = 20;    // trend eligibility: current unique listeners
export const DAILY_CAP = 3;               // counted events per user/track/UTC day
export const GROWTH_SMOOTHING = 20;       // g = (U1 - U0) / (U0 + 20)
export const AUDIENCE_SHRINKAGE = 50;     // U1 / (U1 + 50)
export const TREND_WEIGHTS = { growth: 0.55, likeRate: 0.20, playlistAddRate: 0.15, repeatRate: 0.10 } as const;
export type Signal = keyof typeof TREND_WEIGHTS;

export type Window = { start: number; end: number };
export const utcDayStart = (time: number) => Math.floor(time / DAY_MS) * DAY_MS;
export const inWindow = (time: number, window: Window) => time >= window.start && time < window.end;
/** Two equal, adjacent, complete seven-day UTC windows ending at the UTC midnight at or before `end`. */
export function weeklyWindows(end: number): { current: Window; previous: Window } {
  const close = utcDayStart(end);
  return { current: { start: close - 7 * DAY_MS, end: close }, previous: { start: close - 14 * DAY_MS, end: close - 7 * DAY_MS } };
}

export type EventRow = { userId: string; trackId: string; at: number; regionId: string | null };

/** Keeps at most `cap` events per user/track/UTC day (earliest first) so a few heavy users cannot dominate. */
export function capDaily<T extends EventRow>(events: T[], cap = DAILY_CAP): T[] {
  const seen = new Map<string, number>();
  return [...events].sort((a, b) => a.at - b.at).filter(event => {
    const key = `${event.userId}|${event.trackId}|${utcDayStart(event.at)}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count <= cap;
  });
}

export const distinctUsers = (events: EventRow[]) => new Set(events.map(event => event.userId)).size;

export type Distribution = { shares: Record<string, number>; counts: Record<string, number>; total: number; uncategorized: number };
/**
 * p[g] = count[g] / Σ_h count[h], where an event of a track with k genres adds 1/k to each.
 * Events of tracks without genres are excluded from the shares and reported separately.
 */
export function genreDistribution(events: EventRow[], trackGenres: Map<string, string[]>): Distribution {
  const counts: Record<string, number> = {};
  let uncategorized = 0;
  for (const event of events) {
    const genres = trackGenres.get(event.trackId) ?? [];
    if (!genres.length) { uncategorized++; continue; }
    for (const genre of genres) counts[genre] = (counts[genre] ?? 0) + 1 / genres.length;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const shares = Object.fromEntries(Object.entries(counts).map(([genre, value]) => [genre, total ? value / total : 0]));
  return { shares, counts, total, uncategorized };
}

/** TV(p, q) = ½ Σ_g |p[g] − q[g]| over the union of genres (missing = 0). In [0, 1]. */
export function totalVariation(p: Record<string, number>, q: Record<string, number>): number {
  const genres = new Set([...Object.keys(p), ...Object.keys(q)]);
  let sum = 0;
  for (const genre of genres) sum += Math.abs((p[genre] ?? 0) - (q[genre] ?? 0));
  return sum / 2;
}

/** Empirical percentile ranks in [0, 1]: (average rank − 1) / (n − 1); ties share their average rank; n = 1 or all equal → 0.5. */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 1) return [0.5];
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && order[j + 1]!.value === order[i]!.value) j++;
    const average = (i + j) / 2 + 1; // 1-based average rank of the tie group
    for (let k = i; k <= j; k++) ranks[order[k]!.index] = average;
    i = j + 1;
  }
  return ranks.map(rank => (rank - 1) / (n - 1));
}

export type TrendInput = { trackId: string; U0: number; U1: number; likers: number; repeaters: number; playlistAdders?: number | null };
export type TrendRow = TrendInput & {
  growth: number;                 // smoothed g
  rawGrowth: number | null;       // (U1 − U0) / U0, undefined when U0 = 0
  newEntry: boolean;              // U0 = 0: "new entry", not infinite growth
  likeRate: number; repeatRate: number; playlistAddRate: number | null;
  percentiles: Partial<Record<Signal, number>>;
  weights: Partial<Record<Signal, number>>; // renormalized weights actually used
  audienceFactor: number;         // U1 / (U1 + 50)
  score: number;
};
/**
 * trend(t) = 100 · U1/(U1+50) · Σ_j w_j · percentile(signal_j), over tracks with U1 ≥ 20.
 * A signal unavailable for the cohort (playlist additions until timestamped add events exist)
 * is omitted and the remaining declared weights are renormalized — never filled with invented values.
 */
export function trendScores(rows: TrendInput[], weights: Record<Signal, number> = TREND_WEIGHTS, minListeners = MIN_TREND_LISTENERS): TrendRow[] {
  const eligible = rows.filter(row => row.U1 >= minListeners);
  if (!eligible.length) return [];
  const playlistAvailable = eligible.every(row => typeof row.playlistAdders === 'number');
  const signals: Signal[] = ['growth', 'likeRate', 'repeatRate', ...(playlistAvailable ? ['playlistAddRate' as const] : [])];
  const weightSum = signals.reduce((sum, signal) => sum + weights[signal], 0);
  const used = Object.fromEntries(signals.map(signal => [signal, weights[signal] / weightSum])) as Partial<Record<Signal, number>>;
  const value = (row: TrendInput, signal: Signal) =>
    signal === 'growth' ? (row.U1 - row.U0) / (row.U0 + GROWTH_SMOOTHING)
    : signal === 'likeRate' ? row.likers / row.U1
    : signal === 'repeatRate' ? row.repeaters / row.U1
    : (row.playlistAdders ?? 0) / row.U1;
  const percentiles = Object.fromEntries(signals.map(signal => [signal, percentileRanks(eligible.map(row => value(row, signal)))])) as Record<Signal, number[]>;
  return eligible.map((row, index) => {
    const own = Object.fromEntries(signals.map(signal => [signal, percentiles[signal][index]!])) as Partial<Record<Signal, number>>;
    const audienceFactor = row.U1 / (row.U1 + AUDIENCE_SHRINKAGE);
    const blend = signals.reduce((sum, signal) => sum + used[signal]! * own[signal]!, 0);
    return {
      ...row,
      growth: value(row, 'growth'), rawGrowth: row.U0 > 0 ? (row.U1 - row.U0) / row.U0 : null, newEntry: row.U0 === 0,
      likeRate: value(row, 'likeRate'), repeatRate: value(row, 'repeatRate'), playlistAddRate: playlistAvailable ? value(row, 'playlistAddRate') : null,
      percentiles: own, weights: used, audienceFactor, score: 100 * audienceFactor * blend,
    };
  }).sort((a, b) => b.score - a.score || b.U1 - a.U1 || a.trackId.localeCompare(b.trackId));
}

/** Trailing k-day moving average; null until k values are available. */
export function movingAverage(values: number[], k = 7): (number | null)[] {
  return values.map((_, index) => index + 1 < k ? null : values.slice(index + 1 - k, index + 1).reduce((sum, value) => sum + value, 0) / k);
}
