// Song recommendations (docs/MATHEMATICS.md section 1). Pure: no database, clock or HTTP.
import { capDaily, type EventRow } from '../analytics/math.js';

export const DEFAULT_NEIGHBOURS = 20;
export const DEFAULT_LIST_LENGTH = 10;
// Privacy safeguard for live recommendations: personal "listeners like you" results need at
// least this many similar listeners, so one person's listening cannot be inferred.
export const MIN_PRIVATE_NEIGHBOURS = 5;

export type Vector = Map<string, number>;
/**
 * v[u,g] = Σ_e w(e)·a(track(e), g) with w(e) = 1 after the per-user/track/day cap of 3 and
 * a(t, g) = 1/|genres(t)| for each genre of t (multi-genre tracks get no extra total weight).
 */
export function preferenceVectors(events: EventRow[], trackGenres: Map<string, string[]>): Map<string, Vector> {
  const vectors = new Map<string, Vector>();
  for (const event of capDaily(events)) {
    const genres = trackGenres.get(event.trackId) ?? [];
    if (!genres.length) continue;
    const vector = vectors.get(event.userId) ?? new Map<string, number>();
    for (const genre of genres) vector.set(genre, (vector.get(genre) ?? 0) + 1 / genres.length);
    vectors.set(event.userId, vector);
  }
  return vectors;
}

/** sim(u, v) = dot / (‖u‖·‖v‖); a zero vector has similarity 0. */
export function cosine(a: Vector | undefined, b: Vector | undefined): number {
  if (!a || !b) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (const [genre, value] of a) { normA += value * value; dot += value * (b.get(genre) ?? 0); }
  for (const value of b.values()) normB += value * value;
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

export type Model = {
  vectors: Map<string, Vector>;
  heard: Map<string, Set<string>>;   // user → tracks with a counted listen in the training data
  listeners: Map<string, number>;    // track → distinct training listeners (popularity, tie-breaks)
  catalog: Set<string>;              // tracks eligible for recommendation
};
export function fitModel(events: EventRow[], trackGenres: Map<string, string[]>, catalog?: Iterable<string>): Model {
  const heard = new Map<string, Set<string>>();
  for (const event of events) heard.set(event.userId, (heard.get(event.userId) ?? new Set()).add(event.trackId));
  const audience = new Map<string, Set<string>>();
  for (const event of events) audience.set(event.trackId, (audience.get(event.trackId) ?? new Set()).add(event.userId));
  return {
    vectors: preferenceVectors(events, trackGenres), heard,
    listeners: new Map([...audience].map(([track, users]) => [track, users.size])),
    catalog: new Set(catalog ?? audience.keys()),
  };
}

/** Up to k most similar other users with positive similarity (ties by user ID). */
export function neighbours(model: Model, userId: string, k = DEFAULT_NEIGHBOURS): { userId: string; similarity: number }[] {
  const own = model.vectors.get(userId);
  if (!own) return [];
  const result: { userId: string; similarity: number }[] = [];
  for (const [other, vector] of model.vectors) {
    if (other === userId) continue;
    const similarity = cosine(own, vector);
    if (similarity > 0) result.push({ userId: other, similarity });
  }
  return result.sort((a, b) => b.similarity - a.similarity || a.userId.localeCompare(b.userId)).slice(0, k);
}

export type Recommendation = { trackId: string; score: number; reason: 'neighbours' | 'popular'; supporters: number };
export type RecommendOptions = { k?: number; length?: number; exclude?: Iterable<string>; fill?: boolean; minNeighbours?: number };

/** Baseline: tracks by distinct training listeners, excluding known tracks (ties by track ID). */
export function popular(model: Model, exclude: Set<string>, length = DEFAULT_LIST_LENGTH): Recommendation[] {
  return [...model.catalog].filter(track => !exclude.has(track) && (model.listeners.get(track) ?? 0) > 0)
    .sort((a, b) => (model.listeners.get(b) ?? 0) - (model.listeners.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, length).map(trackId => ({ trackId, score: model.listeners.get(trackId)!, reason: 'popular' as const, supporters: model.listeners.get(trackId)! }));
}

/**
 * score(u, t) = Σ_v sim(u,v)·I(v listened to t) / Σ_v sim(u,v) over the neighbour set, for tracks
 * the user has not heard. Sorted by score, then training listeners, then track ID. With no
 * history or too few useful neighbours, falls back to popularity. With `fill`, a short
 * personal list is completed with popular tracks (a separately evaluated variant).
 */
export function recommend(model: Model, userId: string, options: RecommendOptions = {}): Recommendation[] {
  const { k = DEFAULT_NEIGHBOURS, length = DEFAULT_LIST_LENGTH, fill = false, minNeighbours = 1 } = options;
  const known = new Set([...(model.heard.get(userId) ?? []), ...(options.exclude ?? [])]);
  const near = neighbours(model, userId, k);
  if (near.length < minNeighbours) return popular(model, known, length);
  const total = near.reduce((sum, item) => sum + item.similarity, 0);
  const scores = new Map<string, { weight: number; supporters: number }>();
  for (const { userId: other, similarity } of near) {
    for (const track of model.heard.get(other) ?? []) {
      if (known.has(track) || !model.catalog.has(track)) continue;
      const entry = scores.get(track) ?? { weight: 0, supporters: 0 };
      entry.weight += similarity; entry.supporters += 1;
      scores.set(track, entry);
    }
  }
  const personal = [...scores].map(([trackId, entry]) => ({ trackId, score: entry.weight / total, reason: 'neighbours' as const, supporters: entry.supporters }))
    .sort((a, b) => b.score - a.score || (model.listeners.get(b.trackId) ?? 0) - (model.listeners.get(a.trackId) ?? 0) || a.trackId.localeCompare(b.trackId))
    .slice(0, length);
  if (!personal.length) return popular(model, known, length);
  if (!fill || personal.length >= length) return personal;
  const taken = new Set([...known, ...personal.map(item => item.trackId)]);
  return [...personal, ...popular(model, taken, length - personal.length)];
}
