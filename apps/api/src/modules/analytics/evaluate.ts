// Evaluation of the Pulse models against the planted synthetic ground truth
// (MATHEMATICS.md section 2 "Evaluate with seeded synthetic series…" and section 3
// "Recover known seeded regional distributions… resampling users"). Pure and in-memory.
import { DAY_MS, capDaily, genreDistribution, inWindow, totalVariation, trendScores, weeklyWindows, TREND_WEIGHTS, type EventRow, type Signal } from './math.js';
import { computePulse, type RegionRef, type TrackRef } from './pulse.js';
import { DEFAULT_CONFIG, SYNTHETIC_REGIONS, generateSynthetic, prng, type Role, type SyntheticDataset } from './synthetic.js';

export function pulseInputFrom(data: SyntheticDataset, end: number, regionCode: string | null) {
  const regions: RegionRef[] = SYNTHETIC_REGIONS.map(region => ({ id: region.code, code: region.code, name: region.name }));
  return {
    origin: 'SYNTHETIC' as const, end, regions, regionCode,
    events: data.events.map(event => ({ userId: event.userId, trackId: event.trackId, at: event.at, regionId: event.regionCode })),
    likes: data.likes,
    tracks: new Map<string, TrackRef>(data.tracks.map(track => [track.id, { id: track.id, title: track.title, artist: data.artist.name, slug: track.slug }])),
    trackGenres: new Map(data.tracks.map(track => [track.id, [track.genre]])),
  };
}

// Raw per-track audiences for a window ending at `end` (all regions).
function audiences(data: SyntheticDataset, end: number) {
  const { current, previous } = weeklyWindows(end);
  const usersIn = (window: { start: number; end: number }) => {
    const map = new Map<string, Map<string, number>>();
    for (const event of data.events) if (inWindow(event.at, window)) {
      const users = map.get(event.trackId) ?? new Map<string, number>();
      users.set(event.userId, (users.get(event.userId) ?? 0) + 1); map.set(event.trackId, users);
    }
    return map;
  };
  const now = usersIn(current), before = usersIn(previous);
  const liked = new Set(data.likes.filter(like => inWindow(like.at, current)).map(like => `${like.userId}|${like.trackId}`));
  return data.tracks.map(track => {
    const users = now.get(track.id) ?? new Map<string, number>();
    return { trackId: track.id, U0: before.get(track.id)?.size ?? 0, U1: users.size, likers: [...users.keys()].filter(user => liked.has(`${user}|${track.id}`)).length, repeaters: [...users.values()].filter(count => count >= 2).length };
  });
}

export type EvaluationReport = ReturnType<typeof evaluatePulse>;
export function evaluatePulse(data: SyntheticDataset = generateSynthetic(DEFAULT_CONFIG), resamples = 200) {
  const end = data.meta.referenceDate;
  const role = new Map(data.tracks.map(track => [track.id, track.role]));
  const title = new Map(data.tracks.map(track => [track.id, track.title]));
  const breakouts = new Set(data.truth.roles.breakout);
  const K = breakouts.size;
  const precisionAtK = (ranked: string[]) => ranked.slice(0, K).filter(id => breakouts.has(id)).length / K;
  const rows = audiences(data, end);

  // 1. Trend score vs. two baselines (MATHEMATICS.md: compare to raw growth and current popularity).
  const trend = trendScores(rows);
  const rawGrowth = [...rows].filter(row => row.U0 > 0).sort((a, b) => (b.U1 - b.U0) / b.U0 - (a.U1 - a.U0) / a.U0);
  const popularity = [...rows].sort((a, b) => b.U1 - a.U1);
  const position = (ranked: string[], id: string) => { const index = ranked.indexOf(id); return index < 0 ? null : index + 1; };
  const spikeId = data.truth.roles.spike[0]!, tinyId = data.truth.roles.tiny[0]!;
  const rankings = {
    trend: trend.map(row => row.trackId), rawGrowth: rawGrowth.map(row => row.trackId), popularity: popularity.map(row => row.trackId),
  };
  const comparison = Object.fromEntries(Object.entries(rankings).map(([name, ranked]) => [name, {
    precisionAtK: precisionAtK(ranked), spikeRank: position(ranked, spikeId), tinyRank: position(ranked, tinyId),
    top5: ranked.slice(0, 5).map(id => `${title.get(id)} (${role.get(id)})`),
  }]));

  // 2. Sensitivity to the declared weights and the eligibility threshold.
  const sensitivity = [0.40, 0.55, 0.70].flatMap(growth => [10, 20, 40].map(threshold => {
    const rest = 1 - growth;
    const weights: Record<Signal, number> = { growth, likeRate: rest * (0.20 / 0.45), playlistAddRate: rest * (0.15 / 0.45), repeatRate: rest * (0.10 / 0.45) };
    const ranked = trendScores(rows, weights, threshold).map(row => row.trackId);
    return { growthWeight: growth, minimumListeners: threshold, precisionAtK: precisionAtK(ranked), spikeRank: position(ranked, spikeId) };
  }));

  // 3. Detection lag: windows ending on each of the last 14 days; first day ≥ 2 of 3 breakouts are in the top 3.
  const lag = Array.from({ length: 15 }, (_, back) => end - (14 - back) * DAY_MS).map(dayEnd => {
    const ranked = trendScores(audiences(data, dayEnd)).map(row => row.trackId);
    return { windowEnd: new Date(dayEnd).toISOString().slice(0, 10), breakoutsInTop3: ranked.slice(0, 3).filter(id => breakouts.has(id)).length, spikeInTop3: ranked.slice(0, 3).includes(spikeId) };
  });
  const firstDetection = lag.find(day => day.breakoutsInTop3 >= 2)?.windowEnd ?? null;
  const falseAlertDays = lag.filter(day => day.spikeInTop3).map(day => day.windowEnd);

  // 4. Regional recovery: estimated (capped, current window) vs. the planted preferences, and user-level bootstrap.
  const { current } = weeklyWindows(end);
  const genres = new Map(data.tracks.map(track => [track.id, [track.genre]]));
  const eventsOf = (code: string): EventRow[] => data.events.filter(event => event.regionCode === code && inWindow(event.at, current)).map(event => ({ userId: event.userId, trackId: event.trackId, at: event.at, regionId: code }));
  const random = prng(data.meta.seed + 1);
  const regional = SYNTHETIC_REGIONS.map(region => {
    const events = eventsOf(region.code);
    const estimate = genreDistribution(capDaily(events), genres).shares;
    const byUser = new Map<string, EventRow[]>();
    for (const event of events) byUser.set(event.userId, [...(byUser.get(event.userId) ?? []), event]);
    const people = [...byUser.keys()];
    // Resample *users* with replacement (their listens are dependent), re-estimate, measure TV to the full estimate.
    const distances = Array.from({ length: resamples }, () => {
      const sample: EventRow[] = [];
      people.forEach((_, i) => { const chosen = people[Math.floor(random() * people.length)]!; sample.push(...byUser.get(chosen)!.map(event => ({ ...event, userId: `${chosen}#${i}` }))); });
      return totalVariation(genreDistribution(capDaily(sample), genres).shares, estimate);
    }).sort((a, b) => a - b);
    return {
      region: region.name, listeners: people.length, events: events.length,
      tvToTruth: totalVariation(estimate, region.prefs),
      bootstrapTvMedian: distances[Math.floor(resamples * 0.5)]!, bootstrapTv95: distances[Math.floor(resamples * 0.95)]!,
    };
  });
  const pairs = SYNTHETIC_REGIONS.flatMap((a, i) => SYNTHETIC_REGIONS.slice(i + 1).map(b => {
    const pa = genreDistribution(capDaily(eventsOf(a.code)), genres).shares, pb = genreDistribution(capDaily(eventsOf(b.code)), genres).shares;
    return { pair: `${a.code}–${b.code}`, estimatedTv: totalVariation(pa, pb), trueTv: totalVariation(a.prefs, b.prefs) };
  }));

  // 4b. Why estimated distances are lower than planted ones: regenerate without replays and drop the
  // region-independent spike. If the estimator is sound, the gap should then (almost) disappear.
  const meanPairTv = (dataset: SyntheticDataset, dropSpike: boolean) => {
    const spikes = new Set(dataset.truth.roles.spike);
    const window = weeklyWindows(dataset.meta.referenceDate).current;
    const shares = (code: string) => genreDistribution(capDaily(dataset.events.filter(event => event.regionCode === code && inWindow(event.at, window) && !(dropSpike && spikes.has(event.trackId))).map(event => ({ userId: event.userId, trackId: event.trackId, at: event.at, regionId: code }))), genres).shares;
    const values = SYNTHETIC_REGIONS.flatMap((a, i) => SYNTHETIC_REGIONS.slice(i + 1).map(b => totalVariation(shares(a.code), shares(b.code))));
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const trueMean = pairs.reduce((sum, row) => sum + row.trueTv, 0) / pairs.length;
  const withoutReplays = generateSynthetic({ ...data.meta, repeatProbability: 0 });
  const mechanism = { trueMean, estimated: meanPairTv(data, false), withoutSpike: meanPairTv(data, true), withoutReplaysOrSpike: meanPairTv(withoutReplays, true) };

  // 5. Privacy check on the real pipeline: a region forced below the threshold returns no numbers.
  const smallRegion = computePulse({ ...pulseInputFrom(data, end, 'AM'), minimumListeners: 10_000 });

  return {
    dataset: { ...data.meta, referenceDate: new Date(end).toISOString().slice(0, 10), users: data.users.length, tracks: data.tracks.length, events: data.events.length, likes: data.likes.length, spikeDay: data.truth.spikeDay },
    planted: Object.fromEntries((['breakout', 'steady', 'spike', 'tiny'] as Role[]).map(r => [r, data.truth.roles[r].map(id => title.get(id))])),
    weights: TREND_WEIGHTS, K, comparison, sensitivity, lag, firstDetection, falseAlertDays, regional, pairs, mechanism,
    suppressionCheck: { suppressed: smallRegion.suppressed, summaryHidden: smallRegion.summary === null, trendingHidden: smallRegion.trending.length === 0 },
    trendTop10: trend.slice(0, 10).map(row => ({ track: title.get(row.trackId), role: role.get(row.trackId), U0: row.U0, U1: row.U1, growth: row.growth, likeRate: row.likeRate, repeatRate: row.repeatRate, score: row.score })),
  };
}

export function reportMarkdown(report: EvaluationReport): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const f = (value: number, digits = 3) => value.toFixed(digits);
  const lines = [
    '# Music Pulse evaluation on synthetic data', '',
    `Generated by \`npm run pulse:evaluate -w apps/api\` (pure, in-memory; no database). Generator \`${report.dataset.generatorVersion}\`, seed ${report.dataset.seed}, reference date ${report.dataset.referenceDate} (exclusive), ${report.dataset.days} days, ${report.dataset.users} users, ${report.dataset.tracks} tracks, ${report.dataset.events} counted events, ${report.dataset.likes} likes. Everything here is **synthetic demonstration data**, not platform measurements.`, '',
    `Planted: breakout = ${report.planted.breakout!.join(', ')}; steady = ${report.planted.steady!.join(', ')}; one-day spike = ${report.planted.spike!.join(', ')} on ${report.dataset.spikeDay}; tiny-denominator = ${report.planted.tiny!.join(', ')}. Weekend activity ×1.35.`, '',
    '## 1. Trend score vs. baselines (current 7-day window)', '',
    `Precision@${report.K} = share of the top ${report.K} that are planted breakouts.`, '',
    '| Ranking | Precision@K | Spike rank | Tiny-track rank | Top 5 |', '| --- | --- | --- | --- | --- |',
    ...Object.entries(report.comparison).map(([name, row]) => `| ${name} | ${f(row.precisionAtK, 2)} | ${row.spikeRank ?? 'not ranked'} | ${row.tinyRank ?? 'not eligible'} | ${row.top5.join('; ')} |`), '',
    '## 2. Sensitivity to weights and eligibility threshold', '',
    '| Growth weight | Min. listeners | Precision@K | Spike rank |', '| --- | --- | --- | --- |',
    ...report.sensitivity.map(row => `| ${row.growthWeight} | ${row.minimumListeners} | ${f(row.precisionAtK, 2)} | ${row.spikeRank ?? '—'} |`), '',
    '## 3. Detection lag and false alerts', '',
    `First window end with at least 2 of 3 breakouts in the top 3: **${report.firstDetection ?? 'never'}**. Days on which the one-day spike was in the top 3: ${report.falseAlertDays.length ? report.falseAlertDays.join(', ') : 'none'}.`, '',
    '| Window end | Breakouts in top 3 | Spike in top 3 |', '| --- | --- | --- |',
    ...report.lag.map(row => `| ${row.windowEnd} | ${row.breakoutsInTop3} | ${row.spikeInTop3 ? 'yes' : 'no'} |`), '',
    '## 4. Regional genre distributions', '',
    'TV to truth = total variation distance between the estimated distribution (capped, current week) and the planted preferences. Bootstrap = resampling users with replacement (200 times), TV between resampled and full estimate.', '',
    '| Region | Listeners | Events | TV to truth | Bootstrap TV median | Bootstrap TV 95th pct. |', '| --- | --- | --- | --- | --- | --- |',
    ...report.regional.map(row => `| ${row.region} | ${row.listeners} | ${row.events} | ${f(row.tvToTruth)} | ${f(row.bootstrapTvMedian)} | ${f(row.bootstrapTv95)} |`), '',
    '| Region pair | Estimated TV | True TV |', '| --- | --- | --- |',
    ...report.pairs.map(row => `| ${row.pair} | ${f(row.estimatedTv)} | ${f(row.trueTv)} |`), '',
    `Mean pairwise distance: planted ${f(report.mechanism.trueMean)}, estimated ${f(report.mechanism.estimated)}; without the one-day spike ${f(report.mechanism.withoutSpike)}; regenerated without replays (repeat probability 0) and without the spike ${f(report.mechanism.withoutReplaysOrSpike)}. The estimator therefore recovers the planted preferences when listening follows preferences; the smaller estimated distances come from the simulated behaviour — replays pick uniformly among a user's previously heard tracks, flattening every region towards the overall mix, and the spike adds the same Ambient listening everywhere. This illustrates that p[r,g] measures event-weighted demand, not latent preference (MATHEMATICS.md section 3).`, '',
    '## 5. Trend top 10 with components', '',
    '| Track | Planted role | U0 | U1 | g | Like rate | Repeat rate | Score |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.trendTop10.map(row => `| ${row.track} | ${row.role} | ${row.U0} | ${row.U1} | ${f(row.growth, 2)} | ${pct(row.likeRate)} | ${pct(row.repeatRate)} | ${f(row.score, 1)} |`), '',
    `Privacy check: forcing the Armenia cohort below the threshold hides all numbers (suppressed: ${report.suppressionCheck.suppressed}, summary hidden: ${report.suppressionCheck.summaryHidden}, trending hidden: ${report.suppressionCheck.trendingHidden}).`, '',
    '## Interpretation limits', '',
    'These results show that the implementation recovers patterns that were deliberately planted by a simple generator with known parameters; they do not show how real listeners behave. The playlist-add signal is omitted (no timestamped add events yet) and its weight is renormalized across the other signals. Precision@K with K = 3 is coarse. Synthetic users choose tracks independently given their taste, which is simpler than real social influence.',
  ];
  return lines.join('\n') + '\n';
}
