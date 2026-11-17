// Deterministic synthetic dataset for the "Synthetic demonstration" mode and for
// evaluating the Pulse models (MATHEMATICS.md, ARCHITECTURE.md "Privacy and reproducibility").
// Pure: the same config always yields identical users, tracks, events and IDs. Known
// patterns are planted so the models can be checked against ground truth:
//   - regional genre preferences (true distributions are returned as `truth`)
//   - sustained breakout tracks, steady popular tracks, a one-day spike,
//     a tiny-denominator track, and weekend seasonality.

import { COUNTRIES } from './countries.js';

export const GENERATOR_VERSION = 'synthetic-v2';
export const DAY = 86_400_000;
export const GENRES = ['Electronic', 'Ambient', 'Jazz', 'Indie', 'Hip-Hop', 'Classical'] as const;
export type Genre = typeof GENRES[number];
// Countries in the demonstration and their share of synthetic listeners. Iceland gets a fixed
// 8 listeners — deliberately below the privacy threshold, so the map shows suppression.
// Genre tastes are drawn from the seed (Dirichlet(2) per country): they are arbitrary
// demonstration values, not claims about music in real countries.
export const SYNTHETIC_COUNTRIES: { code: string; share?: number; users?: number }[] = [
  { code: 'US', share: 0.12 }, { code: 'IN', share: 0.09 }, { code: 'BR', share: 0.08 }, { code: 'DE', share: 0.08 },
  { code: 'GB', share: 0.07 }, { code: 'JP', share: 0.07 }, { code: 'FR', share: 0.06 }, { code: 'MX', share: 0.06 },
  { code: 'KR', share: 0.05 }, { code: 'NG', share: 0.05 }, { code: 'IT', share: 0.05 }, { code: 'ES', share: 0.05 },
  { code: 'CA', share: 0.05 }, { code: 'AU', share: 0.04 }, { code: 'EG', share: 0.04 }, { code: 'AM', share: 0.04 },
  { code: 'IS', users: 8 },
];
const countryName = new Map(COUNTRIES.map(country => [country.code, country.name]));

export type SyntheticConfig = { seed: number; referenceDate: number; days: number; users: number; repeatProbability: number };
// Reference date = the exclusive end of the data (a UTC midnight); the last 7 days are the "current" window.
export const DEFAULT_CONFIG: SyntheticConfig = { seed: 20261117, referenceDate: Date.UTC(2026, 10, 16), days: 56, users: 900, repeatProbability: 0.35 };

export type Role = 'breakout' | 'steady' | 'spike' | 'tiny' | 'normal';
export type SyntheticTrack = { id: string; slug: string; title: string; genre: Genre; role: Role; durationMs: number };
export type SyntheticUser = { id: string; username: string; email: string; regionCode: string };
export type SyntheticEvent = { id: string; sessionId: string; userId: string; trackId: string; at: number; listenedMs: number; completion: number; regionCode: string };
export type SyntheticDataset = {
  meta: SyntheticConfig & { generatorVersion: string };
  artist: { id: string; name: string };
  regions: { code: string; name: string }[];
  users: SyntheticUser[]; tracks: SyntheticTrack[]; events: SyntheticEvent[]; likes: { userId: string; trackId: string; at: number }[];
  truth: { regionGenreShares: Record<string, Record<Genre, number>>; roles: Record<Role, string[]>; spikeDay: string };
};

/** mulberry32: small, fast, deterministic PRNG (not cryptographic). */
export function prng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generateSynthetic(config: SyntheticConfig = DEFAULT_CONFIG): SyntheticDataset {
  const random = prng(config.seed);
  const uuid = () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
    hex[12] = '4'; hex[16] = '89ab'[Math.floor(random() * 4)]!;
    const h = hex.join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  const pick = <T,>(items: T[], weights: number[]) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let target = random() * total;
    for (let i = 0; i < items.length; i++) { target -= weights[i]!; if (target < 0) return items[i]!; }
    return items[items.length - 1]!;
  };
  const poisson = (lambda: number) => { const limit = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= random(); } while (p > limit); return k - 1; };

  const artist = { id: uuid(), name: 'Synthetic Studio (demonstration data)' };
  // 6 tracks per genre; planted roles at fixed positions.
  const roleOf: Record<string, Role> = { 'Indie-0': 'breakout', 'Electronic-1': 'breakout', 'Hip-Hop-2': 'breakout', 'Electronic-0': 'steady', 'Hip-Hop-0': 'steady', 'Jazz-0': 'steady', 'Indie-1': 'steady', 'Ambient-0': 'spike', 'Classical-0': 'tiny' };
  const tracks: SyntheticTrack[] = GENRES.flatMap(genre => Array.from({ length: 6 }, (_, index) => {
    const role = roleOf[`${genre}-${index}`] ?? 'normal';
    const n = GENRES.indexOf(genre) * 6 + index + 1;
    return { id: uuid(), slug: `syn-track-${String(n).padStart(2, '0')}`, title: `${genre} sample ${index + 1}`, genre, role, durationMs: 150_000 + Math.floor(random() * 120_000) };
  }));
  const day0 = config.referenceDate - config.days * DAY;
  const currentStart = config.days - 7, previousStart = config.days - 14;
  const spikeDayIndex = config.days - 3;
  const weight = (track: SyntheticTrack, day: number) => {
    switch (track.role) {
      case 'steady': return 2.5;
      case 'breakout': return day < previousStart ? 0.25 : day < currentStart ? 0.9 : 3.2; // sustained rise into the current window
      case 'tiny': return day < currentStart ? 0.01 : 0.06;                                 // few listeners, large relative growth
      case 'spike': return 0.3;                                                             // plus a one-day burst below
      default: return 1;
    }
  };
  const users: SyntheticUser[] = [];
  const tasteOf = new Map<string, Record<Genre, number>>();
  const activity = new Map<string, number>();
  // Seeded Dirichlet(2) genre preferences per country (sum of two exponentials = Gamma(2)).
  const gamma2 = () => -Math.log(1 - random()) - Math.log(1 - random());
  const regions = SYNTHETIC_COUNTRIES.map(country => {
    const draws = GENRES.map(() => gamma2());
    const total = draws.reduce((sum, value) => sum + value, 0);
    return { ...country, name: countryName.get(country.code) ?? country.code, prefs: Object.fromEntries(GENRES.map((genre, i) => [genre, draws[i]! / total])) as Record<Genre, number> };
  });
  regions.forEach(region => {
    const count = region.users ?? Math.round(config.users * region.share!);
    for (let i = 0; i < count; i++) {
      const n = users.length + 1;
      const user = { id: uuid(), username: `syn_${String(n).padStart(4, '0')}`, email: `syn-${String(n).padStart(4, '0')}@synthetic.invalid`, regionCode: region.code };
      users.push(user);
      // Personal taste: 70% the region's preferences + 30% one favourite drawn from them, so the
      // expected genre mix across a region's users equals the region's preferences.
      const favourite = pick([...GENRES], GENRES.map(g => region.prefs[g]));
      tasteOf.set(user.id, Object.fromEntries(GENRES.map(g => [g, 0.7 * region.prefs[g] + (g === favourite ? 0.3 : 0)])) as Record<Genre, number>);
      activity.set(user.id, 0.4 + 1.6 * random() ** 2); // listens per day, skewed: a few heavy listeners
    }
  });
  const trackById = new Map(tracks.map(track => [track.id, track]));
  const byGenre = new Map(GENRES.map(genre => [genre, tracks.filter(track => track.genre === genre)]));
  const events: SyntheticEvent[] = [];
  const likes: SyntheticDataset['likes'] = [];
  const history = new Map<string, Map<string, number>>(); // user → track → listens so far
  const record = (user: SyntheticUser, track: SyntheticTrack, at: number) => {
    const completion = Math.min(1, 0.45 + random() * 0.6);
    events.push({ id: uuid(), sessionId: uuid(), userId: user.id, trackId: track.id, at, listenedMs: Math.max(30_000, Math.round(track.durationMs * completion)), completion, regionCode: user.regionCode });
    const heard = history.get(user.id) ?? new Map<string, number>();
    const count = (heard.get(track.id) ?? 0) + 1;
    heard.set(track.id, count);
    history.set(user.id, heard);
    if (count === 2 && random() < 0.3) likes.push({ userId: user.id, trackId: track.id, at: at + 60_000 });
  };
  for (let day = 0; day < config.days; day++) {
    const start = day0 + day * DAY;
    const weekday = new Date(start).getUTCDay();
    const seasonal = weekday === 0 || weekday === 6 ? 1.35 : 1; // weekend seasonality
    for (const user of users) {
      const listens = poisson(activity.get(user.id)! * seasonal);
      for (let i = 0; i < listens; i++) {
        const heard = history.get(user.id);
        let track: SyntheticTrack;
        if (heard && heard.size && random() < config.repeatProbability) {
          // Return to something already heard (creates repeat listeners).
          const ids = [...heard.keys()];
          const chosenId = ids[Math.floor(random() * ids.length)]!;
          const candidate = trackById.get(chosenId)!;
          track = weight(candidate, day) > 0.05 ? candidate : pick(byGenre.get(candidate.genre)!, byGenre.get(candidate.genre)!.map(t => weight(t, day)));
        } else {
          const genre = pick([...GENRES], GENRES.map(g => tasteOf.get(user.id)![g]));
          const options = byGenre.get(genre)!;
          track = pick(options, options.map(t => weight(t, day)));
        }
        record(user, track, start + Math.floor(random() * DAY));
      }
    }
    if (day === spikeDayIndex) {
      // One-day spike: a quarter of all users play the spike track once that day only.
      const spike = tracks.find(track => track.role === 'spike')!;
      for (const user of users) if (random() < 0.25) record(user, spike, start + Math.floor(random() * DAY));
    }
  }
  const roles = { breakout: [], steady: [], spike: [], tiny: [], normal: [] } as Record<Role, string[]>;
  for (const track of tracks) roles[track.role].push(track.id);
  return {
    meta: { ...config, generatorVersion: GENERATOR_VERSION }, artist, users, tracks, events: events.sort((a, b) => a.at - b.at), likes,
    regions: regions.map(region => ({ code: region.code, name: region.name })),
    truth: { regionGenreShares: Object.fromEntries(regions.map(region => [region.code, region.prefs])), roles, spikeDay: new Date(day0 + spikeDayIndex * DAY).toISOString().slice(0, 10) },
  };
}
