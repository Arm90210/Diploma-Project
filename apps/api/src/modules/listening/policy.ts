// Listening-event policy "listen-v1" (docs/ARCHITECTURE.md, "Event validity and duplicates").
// Pure functions: no clock, database or HTTP, so every rule is unit-tested and the
// exact definition of a counted listen can be cited in the thesis.

export const POLICY_VERSION = 'listen-v1';
export const HEARTBEAT_INTERVAL_MS = 10_000;      // client cadence while playing
export const TOLERANCE_MS = 2_000;                // timer jitter + network delay per heartbeat
export const MAX_CREDIT_PER_HEARTBEAT_MS = 60_000; // bounds credit if heartbeats were delayed (e.g. background tab)
export const REPLAY_COOLDOWN_MS = 30 * 60_000;    // same user + track counts again only after 30 minutes
export const SESSION_LIFETIME_MS = 6 * 3_600_000; // heartbeats are refused after this
export const QUALIFY_CAP_MS = 30_000;

/** A listen qualifies after min(30 s, 50% of the track) of accepted playback. */
export const qualifyThresholdMs = (durationMs: number) => Math.min(QUALIFY_CAP_MS, Math.ceil(durationMs / 2));

export type Interval = [start: number, end: number];
/** Adds [start, end) to a sorted list of disjoint intervals, merging overlaps and touching ends. */
export function addInterval(intervals: Interval[], [start, end]: Interval): Interval[] {
  if (end <= start) return intervals;
  const result: Interval[] = [];
  let next: Interval = [start, end];
  let placed = false;
  for (const current of intervals) {
    if (current[1] < next[0]) result.push(current);
    else if (next[1] < current[0]) { if (!placed) { result.push(next); placed = true; } result.push(current); }
    else next = [Math.min(next[0], current[0]), Math.max(next[1], current[1])];
  }
  if (!placed) result.push(next);
  return result;
}
export const coveredMs = (intervals: Interval[]) => intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
/** Unique share of the track's timeline that was actually heard, in [0, 1]. A seek to the end is not completion. */
export const completionRatio = (intervals: Interval[], durationMs: number) => durationMs > 0 ? Math.min(1, coveredMs(intervals) / durationMs) : 0;

export type SessionState = {
  lastAt: number | null;          // server time (ms) of the last accepted heartbeat
  lastPositionMs: number | null;  // media position reported then
  lastPlaying: boolean;           // whether audio was playing then
  lastSequence: number;           // 0 before the first heartbeat
  accumulatedMs: number;          // accepted listening time (repeats within a session may exceed duration)
  intervals: Interval[];          // unique media-timeline coverage
};
export const initialState = (): SessionState => ({ lastAt: null, lastPositionMs: null, lastPlaying: false, lastSequence: 0, accumulatedMs: 0, intervals: [] });
export type Heartbeat = { sequence: number; positionMs: number; playing: boolean };

/**
 * Applies one heartbeat received at server time `at`.
 * - Sequences must increase; a repeated or older sequence is ignored (safe retries).
 * - Time is credited only for the interval since the previous heartbeat, only if the
 *   audio was playing then, and only when the media position advanced by d with
 *   0 ≤ d ≤ wall-clock time + tolerance. Paused time earns nothing (not playing), and a
 *   seek earns nothing for that interval (position jumped faster than time, or backwards).
 * - Credit per interval is capped, and covered timeline is clamped to the track length.
 */
export function applyHeartbeat(state: SessionState, beat: Heartbeat, at: number, durationMs: number): { state: SessionState; creditedMs: number; accepted: boolean } {
  if (beat.sequence <= state.lastSequence) return { state, creditedMs: 0, accepted: false };
  const position = Math.min(Math.max(0, beat.positionMs), durationMs);
  let credit = 0;
  let intervals = state.intervals;
  if (state.lastPlaying && state.lastAt !== null && state.lastPositionMs !== null) {
    const wall = Math.max(0, at - state.lastAt);
    const advanced = position - state.lastPositionMs;
    if (advanced >= 0 && advanced <= wall + TOLERANCE_MS) {
      credit = Math.min(advanced, MAX_CREDIT_PER_HEARTBEAT_MS);
      intervals = addInterval(intervals, [state.lastPositionMs, state.lastPositionMs + credit]);
    }
  }
  return {
    state: { lastAt: at, lastPositionMs: position, lastPlaying: beat.playing, lastSequence: beat.sequence, accumulatedMs: state.accumulatedMs + credit, intervals },
    creditedMs: credit,
    accepted: true,
  };
}

/** Whether a newly qualified session may be counted, given the user's last counted listen of this track. */
export const outsideCooldown = (lastCountedAt: number | null, at: number) => lastCountedAt === null || at - lastCountedAt >= REPLAY_COOLDOWN_MS;

// ---- request validation (pure) ----
export const SOURCES = ['CATALOG', 'SEARCH', 'PLAYLIST', 'RECOMMENDATION', 'REGIONAL_CHART'] as const;
export type Source = typeof SOURCES[number];
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => key in value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export function parseStart(body: unknown): { trackId: string; source: Source } | null {
  if (!plain(body) || !exactKeys(body, ['trackId', 'source'])) return null;
  if (typeof body.trackId !== 'string' || !UUID.test(body.trackId) || !SOURCES.includes(body.source as Source)) return null;
  return { trackId: body.trackId, source: body.source as Source };
}
/** Positions are bounded to one day; the service clamps them to the actual track length. */
export function parseHeartbeat(body: unknown): Heartbeat | null {
  if (!plain(body) || !exactKeys(body, ['sequence', 'positionMs', 'playing'])) return null;
  if (!int(body.sequence, 1, 1_000_000) || !int(body.positionMs, 0, 86_400_000) || typeof body.playing !== 'boolean') return null;
  return { sequence: body.sequence as number, positionMs: body.positionMs as number, playing: body.playing };
}
