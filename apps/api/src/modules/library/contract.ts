// Pure library rules (no Express/Prisma) so they are unit-tested directly.

export type LibraryPlaylist = { id: string; title: string; isPublic: boolean; trackIds: string[] };
export type LibraryView = { likedTrackIds: string[]; playlists: LibraryPlaylist[] };
export type LibraryImport = { liked: string[]; playlists: { title: string; trackIds: string[] }[] };
export type ImportSummary = { likesAdded: number; playlistsCreated: number; playlistsMerged: number; tracksAdded: number; skipped: number };

export const MAX_PLAYLISTS = 200;
export const MAX_PLAYLIST_TRACKS = 500;
export const MAX_TITLE = 80;
export const IMPORT_LIMITS = { liked: 1000, playlists: 100, tracksPerPlaylist: MAX_PLAYLIST_TRACKS, references: 2000 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

// Trimmed, 1–80 characters (counted as code points), no control characters.
export function parseTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  const length = [...title].length;
  return length >= 1 && length <= MAX_TITLE && !/[\u0000-\u001f\u007f]/u.test(title) ? title : null;
}

const plainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

export function parsePlaylistCreate(body: unknown): { title: string } | null {
  if (!plainObject(body) || !onlyKeys(body, ['title'])) return null;
  const title = parseTitle(body.title);
  return title ? { title } : null;
}

// Browser collections may contain old preview IDs ("study-0") or removed tracks.
// Any string is accepted as a reference; only existing REAL track UUIDs are
// imported and the rest are reported as skipped. Sizes are strictly bounded.
export function parseImport(body: unknown): LibraryImport | null {
  if (!plainObject(body) || !onlyKeys(body, ['liked', 'playlists'])) return null;
  const refs = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= 80) ? value as string[] : null;
  const liked = refs(body.liked ?? [], IMPORT_LIMITS.liked);
  if (!liked || !Array.isArray(body.playlists ?? []) || ((body.playlists ?? []) as unknown[]).length > IMPORT_LIMITS.playlists) return null;
  const playlists: LibraryImport['playlists'] = [];
  for (const item of (body.playlists ?? []) as unknown[]) {
    if (!plainObject(item) || !onlyKeys(item, ['title', 'trackIds'])) return null;
    const title = parseTitle(item.title);
    const trackIds = refs(item.trackIds ?? [], IMPORT_LIMITS.tracksPerPlaylist);
    if (!title || !trackIds) return null;
    playlists.push({ title, trackIds });
  }
  if (liked.length + playlists.reduce((sum, list) => sum + list.trackIds.length, 0) > IMPORT_LIMITS.references) return null;
  return { liked, playlists };
}
