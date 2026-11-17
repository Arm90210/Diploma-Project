import {
  DAY_MS, MIN_COHORT_LISTENERS, MIN_TREND_LISTENERS, capDaily, distinctUsers, genreDistribution, inWindow, movingAverage,
  totalVariation, trendScores, weeklyWindows, type EventRow, type TrendRow, type Window,
} from './math.js';

// Builds everything the Music Pulse page shows from plain rows (pure; the service
// loads the rows). One data origin per call: REAL and SYNTHETIC are never blended.

export type Origin = 'REAL' | 'SYNTHETIC';
export type RegionRef = { id: string; code: string; name: string };
export type TrackRef = { id: string; title: string; artist: string; slug: string };
export type PulseInput = {
  origin: Origin;
  end: number;                         // windows close at the UTC midnight at or before this
  regions: RegionRef[];
  regionCode: string | null;           // null = all regions (events with or without a region)
  events: EventRow[];                  // counted events of this origin, at least [end − 34 days, end)
  likes: { userId: string; trackId: string; at: number }[];
  tracks: Map<string, TrackRef>;
  trackGenres: Map<string, string[]>;
  minimumListeners?: number;
};
type Share = { genre: string; share: number; count: number };
export type PulseResult = {
  origin: Origin;
  label: 'Our platform' | 'Synthetic demonstration';
  windows: { current: { start: string; end: string }; previous: { start: string; end: string } };
  region: { code: string; name: string } | null;
  rules: { minimumListeners: number; minimumTrendListeners: number; dailyCap: number; growthSmoothing: number; audienceShrinkage: number };
  suppressed: boolean;                 // cohort below the privacy threshold: no numbers about it at all
  summary: { listeners: number; previousListeners: number | null; listens: number } | null;
  genres: { shares: Share[]; uncategorized: number } | null;
  daily: { day: string; listeners: number | null; average7: number | null }[] | null;
  trending: (Omit<TrendRow, 'trackId'> & { track: TrackRef })[];
  popular: { track: TrackRef; listeners: number }[];
  regions: { code: string; name: string; listeners: number | null; suppressed: boolean; distance: number | null; shares: Share[] | null }[];
  comparisonBase: string;
};

const iso = (window: Window) => ({ start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() });
const sharesOf = (events: EventRow[], trackGenres: Map<string, string[]>) => {
  const distribution = genreDistribution(capDaily(events), trackGenres);
  return {
    list: Object.entries(distribution.shares).map(([genre, share]) => ({ genre, share, count: distribution.counts[genre]! })).sort((a, b) => b.share - a.share || a.genre.localeCompare(b.genre)),
    map: distribution.shares, uncategorized: distribution.uncategorized,
  };
};

export function computePulse(input: PulseInput): PulseResult {
  const minimum = input.minimumListeners ?? MIN_COHORT_LISTENERS;
  const { current, previous } = weeklyWindows(input.end);
  const region = input.regionCode ? input.regions.find(item => item.code === input.regionCode) ?? null : null;
  const inCohort = (event: EventRow) => !region || event.regionId === region.id;
  const cohort = input.events.filter(inCohort);
  const now = cohort.filter(event => inWindow(event.at, current));
  const before = cohort.filter(event => inWindow(event.at, previous));
  const listeners = distinctUsers(now);
  const suppressed = listeners < minimum;
  const base: Omit<PulseResult, 'summary' | 'genres' | 'daily' | 'trending' | 'popular' | 'regions' | 'comparisonBase' | 'suppressed'> = {
    origin: input.origin, label: input.origin === 'REAL' ? 'Our platform' : 'Synthetic demonstration',
    windows: { current: iso(current), previous: iso(previous) }, region: region && { code: region.code, name: region.name },
    rules: { minimumListeners: minimum, minimumTrendListeners: MIN_TREND_LISTENERS, dailyCap: 3, growthSmoothing: 20, audienceShrinkage: 50 },
  };

  // Region comparison: each region's cohort is judged on its own; hidden regions show no numbers.
  const all = sharesOf(input.events.filter(event => inWindow(event.at, current)), input.trackGenres);
  const selectedShares = suppressed ? null : sharesOf(now, input.trackGenres);
  const regions = input.regions.map(item => {
    const events = input.events.filter(event => event.regionId === item.id && inWindow(event.at, current));
    const count = distinctUsers(events);
    if (count < minimum) return { code: item.code, name: item.name, listeners: null, suppressed: true, distance: null, shares: null };
    const shares = sharesOf(events, input.trackGenres);
    const reference = region ? selectedShares?.map ?? null : all.map;
    return { code: item.code, name: item.name, listeners: count, suppressed: false, distance: reference ? totalVariation(shares.map, reference) : null, shares: shares.list };
  });
  const comparisonBase = region ? `Distance from ${region.name}` : 'Distance from all regions combined';

  if (suppressed) return { ...base, suppressed, summary: null, genres: null, daily: null, trending: [], popular: [], regions, comparisonBase };

  // Daily unique listeners for the last 28 days, with a 7-day moving average (34 days loaded).
  const firstDay = current.end - 34 * DAY_MS;
  const perDay = Array.from({ length: 34 }, (_, index) => {
    const start = firstDay + index * DAY_MS;
    return distinctUsers(cohort.filter(event => event.at >= start && event.at < start + DAY_MS));
  });
  const averages = movingAverage(perDay, 7);
  const daily = perDay.map((count, index) => ({ day: new Date(firstDay + index * DAY_MS).toISOString().slice(0, 10), listeners: count >= minimum ? count : null, average7: averages[index] !== null && averages[index]! >= minimum ? averages[index]! : null })).slice(6);

  // Per-track audiences within the cohort.
  const usersBy = (events: EventRow[]) => {
    const map = new Map<string, Map<string, number>>();
    for (const event of events) {
      const users = map.get(event.trackId) ?? new Map<string, number>();
      users.set(event.userId, (users.get(event.userId) ?? 0) + 1);
      map.set(event.trackId, users);
    }
    return map;
  };
  const currentUsers = usersBy(now), previousUsers = usersBy(before);
  const likedBy = new Map<string, Set<string>>();
  for (const like of input.likes) if (inWindow(like.at, current)) likedBy.set(like.trackId, (likedBy.get(like.trackId) ?? new Set()).add(like.userId));
  const rows = [...currentUsers].map(([trackId, users]) => ({
    trackId, U0: previousUsers.get(trackId)?.size ?? 0, U1: users.size,
    likers: [...users.keys()].filter(user => likedBy.get(trackId)?.has(user)).length,
    repeaters: [...users.values()].filter(count => count >= 2).length,
    playlistAdders: null, // needs timestamped playlist-add events (not yet recorded) → signal omitted
  }));
  const known = (id: string): TrackRef => input.tracks.get(id) ?? { id, title: 'Unknown track', artist: '', slug: '' };
  const trending = trendScores(rows).slice(0, 10).map(({ trackId, ...rest }) => ({ ...rest, track: known(trackId) }));
  // Popularity (current audience) as a separate list; only audiences of at least the threshold are shown.
  const popular = rows.filter(row => row.U1 >= minimum).sort((a, b) => b.U1 - a.U1 || a.trackId.localeCompare(b.trackId)).slice(0, 10).map(row => ({ track: known(row.trackId), listeners: row.U1 }));

  return {
    ...base, suppressed,
    summary: { listeners, previousListeners: distinctUsers(before) >= minimum ? distinctUsers(before) : null, listens: now.length },
    genres: { shares: selectedShares!.list, uncategorized: selectedShares!.uncategorized },
    daily, trending, popular, regions, comparisonBase,
  };
}
