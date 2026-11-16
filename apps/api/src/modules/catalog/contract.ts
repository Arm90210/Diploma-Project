// Pure catalog contract: input validation and the public track projection.
// No Express or Prisma imports, so these rules are unit-tested directly.

export type CatalogTrack = {
  id: string;
  slug: string;
  title: string;
  artist: { id: string; name: string };
  genres: string[];
  durationMs: number;
  audioUrl: string | null;
  coverUrl: string | null;
};
export type TrackQuery = { q?: string; genre?: string; limit: number; offset: number };
export type TrackPage = { tracks: CatalogTrack[]; total: number; limit: number; offset: number };
export type GenreSummary = { name: string; trackCount: number };

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const MAX_OFFSET = 10_000;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function text(value: unknown, max: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null; // repeated parameters arrive as arrays
  const trimmed = value.trim();
  if ([...trimmed].length > max || CONTROL.test(trimmed)) return null;
  return trimmed || undefined;
}
function integer(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

export function parseTrackQuery(query: Record<string, unknown>): Parsed<TrackQuery> {
  const unknown = Object.keys(query).filter(key => !['q', 'genre', 'limit', 'offset'].includes(key));
  if (unknown.length) return { ok: false, message: 'Unsupported query parameter' };
  const q = text(query.q, 100);
  const genre = text(query.genre, 80);
  const limit = integer(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = integer(query.offset, 0, 0, MAX_OFFSET);
  if (q === null) return { ok: false, message: 'Search text must be at most 100 characters without control characters' };
  if (genre === null) return { ok: false, message: 'Genre must be at most 80 characters without control characters' };
  if (limit === null) return { ok: false, message: `Limit must be an integer from 1 to ${MAX_LIMIT}` };
  if (offset === null) return { ok: false, message: `Offset must be an integer from 0 to ${MAX_OFFSET}` };
  return { ok: true, value: { ...(q ? { q } : {}), ...(genre ? { genre } : {}), limit, offset } };
}

// A track is addressed by UUID or slug. Anything else is rejected before querying.
export function parseTrackRef(ref: string): { id: string } | { slug: string } | null {
  if (UUID.test(ref)) return { id: ref };
  if (ref.length <= 80 && SLUG.test(ref)) return { slug: ref };
  return null;
}

// Storage keys are internal. Only bundled demo assets ("static/…", served from the
// frontend's public folder) have a public URL today; uploaded files will be served
// by the API with access checks in the upload/streaming step, so other keys map to null.
export function publicAssetUrl(key: string | null): string | null {
  if (!key || !key.startsWith('static/')) return null;
  const path = key.slice('static/'.length);
  return /^[a-z0-9][a-z0-9/_.-]*$/i.test(path) && !path.includes('..') ? `/${path}` : null;
}

export type TrackRow = {
  id: string; slug: string; title: string; durationMs: number; audioKey: string; coverKey: string | null;
  artist: { id: string; name: string };
  genres: { genre: { name: string } }[];
};
// Explicit projection: uploader, rights text and data-origin fields stay server-side.
export function toCatalogTrack(row: TrackRow): CatalogTrack {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    artist: { id: row.artist.id, name: row.artist.name },
    genres: row.genres.map(item => item.genre.name),
    durationMs: row.durationMs,
    audioUrl: publicAssetUrl(row.audioKey),
    coverUrl: publicAssetUrl(row.coverKey),
  };
}
