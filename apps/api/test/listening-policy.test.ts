import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addInterval, applyHeartbeat, completionRatio, initialState, outsideCooldown, parseHeartbeat, parseStart, qualifyThresholdMs, MAX_CREDIT_PER_HEARTBEAT_MS, REPLAY_COOLDOWN_MS, type Heartbeat, type SessionState } from '../src/modules/listening/policy.js';

const D = 24_000; // the demo studies are 24 s long
// Replays a list of [secondsSinceStart, positionSeconds, playing] heartbeats.
function play(beats: [number, number, boolean][], duration = D) {
  let state: SessionState = initialState();
  beats.forEach(([t, position, playing], index) => { state = applyHeartbeat(state, { sequence: index + 1, positionMs: position * 1000, playing }, t * 1000, duration).state; });
  return state;
}

test('qualification threshold is min(30 s, 50% of duration)', () => {
  assert.equal(qualifyThresholdMs(24_000), 12_000);
  assert.equal(qualifyThresholdMs(60_000), 30_000);
  assert.equal(qualifyThresholdMs(240_000), 30_000);
  assert.equal(qualifyThresholdMs(1_001), 501);
});
test('continuous playback is credited in full', () => {
  const state = play([[0, 0, true], [10, 10, true], [20, 20, true], [24, 24, false]]);
  assert.equal(state.accumulatedMs, 24_000);
  assert.deepEqual(state.intervals, [[0, 24_000]]);
  assert.equal(completionRatio(state.intervals, D), 1);
});
test('paused time earns nothing', () => {
  // Play 5 s, pause for 60 s, resume and play 5 s more.
  const state = play([[0, 0, true], [5, 5, false], [65, 5, true], [70, 10, true]]);
  assert.equal(state.accumulatedMs, 10_000);
});
test('a seek forward earns nothing for that interval and leaves a coverage gap', () => {
  // Play 0–5 s, seek to 20 s within a second, play to the end.
  const state = play([[0, 0, true], [5, 5, true], [5.3, 20, true], [9.3, 24, false]]);
  assert.equal(state.accumulatedMs, 9_000);
  assert.deepEqual(state.intervals, [[0, 5_000], [20_000, 24_000]]);
  assert.equal(completionRatio(state.intervals, D), 9 / 24);
});
test('seeking straight to the end is not completion and does not qualify', () => {
  const state = play([[0, 0, true], [0.5, 24, true], [0.6, 24, false]]);
  assert.equal(state.accumulatedMs, 0);
  assert.equal(completionRatio(state.intervals, D), 0);
});
test('replaying a section adds listening time but not unique coverage', () => {
  // Play 0–10, seek back to 0, play 0–10 again.
  const state = play([[0, 0, true], [10, 10, true], [10.2, 0, true], [20.2, 10, true]]);
  assert.equal(state.accumulatedMs, 20_000);
  assert.deepEqual(state.intervals, [[0, 10_000]]);
});
test('claiming faster-than-real-time progress earns nothing', () => {
  const state = play([[0, 0, true], [5, 20, true]]);
  assert.equal(state.accumulatedMs, 0);
});
test('small timer jitter within tolerance is accepted', () => {
  const state = play([[0, 0, true], [10, 11.5, true]]);
  assert.equal(state.accumulatedMs, 11_500);
});
test('delayed heartbeats are capped per interval', () => {
  const state = play([[0, 0, true], [200, 180, true]], 600_000);
  assert.equal(state.accumulatedMs, MAX_CREDIT_PER_HEARTBEAT_MS);
});
test('duplicate or out-of-order sequences are ignored (safe retries)', () => {
  let state = initialState();
  const beat = (sequence: number, positionMs: number): Heartbeat => ({ sequence, positionMs, playing: true });
  state = applyHeartbeat(state, beat(1, 0), 0, D).state;
  const second = applyHeartbeat(state, beat(2, 10_000), 10_000, D);
  state = second.state;
  const retry = applyHeartbeat(state, beat(2, 10_000), 10_500, D);
  assert.equal(retry.accepted, false);
  assert.equal(retry.state, state);
  assert.equal(applyHeartbeat(state, beat(1, 0), 11_000, D).accepted, false);
  assert.equal(state.accumulatedMs, 10_000);
});
test('positions are clamped to the track length', () => {
  const state = play([[0, 20, true], [10, 600, true]]);
  assert.equal(state.lastPositionMs, D);
  assert.equal(state.accumulatedMs, 4_000);
});
test('interval merging', () => {
  assert.deepEqual(addInterval([], [5, 10]), [[5, 10]]);
  assert.deepEqual(addInterval([[0, 5], [20, 30]], [5, 10]), [[0, 10], [20, 30]]);
  assert.deepEqual(addInterval([[0, 5], [20, 30]], [8, 12]), [[0, 5], [8, 12], [20, 30]]);
  assert.deepEqual(addInterval([[0, 5], [8, 12], [20, 30]], [4, 25]), [[0, 30]]);
  assert.deepEqual(addInterval([[10, 20]], [0, 5]), [[0, 5], [10, 20]]);
  assert.deepEqual(addInterval([[10, 20]], [30, 40]), [[10, 20], [30, 40]]);
  assert.deepEqual(addInterval([[10, 20]], [7, 7]), [[10, 20]]);
});
test('replay cooldown boundary is exactly 30 minutes', () => {
  assert.equal(outsideCooldown(null, 0), true);
  assert.equal(outsideCooldown(0, REPLAY_COOLDOWN_MS - 1), false);
  assert.equal(outsideCooldown(0, REPLAY_COOLDOWN_MS), true);
});
test('request validation', () => {
  const id = '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f71';
  assert.deepEqual(parseStart({ trackId: id, source: 'SEARCH' }), { trackId: id, source: 'SEARCH' });
  for (const body of [{}, { trackId: id }, { trackId: 'study-0', source: 'SEARCH' }, { trackId: id, source: 'HACK' }, { trackId: id, source: 'SEARCH', userId: id }, null]) assert.equal(parseStart(body), null);
  assert.deepEqual(parseHeartbeat({ sequence: 1, positionMs: 0, playing: true }), { sequence: 1, positionMs: 0, playing: true });
  for (const body of [{ sequence: 0, positionMs: 0, playing: true }, { sequence: 1.5, positionMs: 0, playing: true }, { sequence: 1, positionMs: -1, playing: true },
    { sequence: 1, positionMs: 0, playing: 'yes' }, { sequence: 1, positionMs: 0 }, { sequence: 1, positionMs: 0, playing: true, at: 5 }, { sequence: '1', positionMs: 0, playing: true }]) assert.equal(parseHeartbeat(body), null, JSON.stringify(body));
});
