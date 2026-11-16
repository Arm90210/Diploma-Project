// Catalog tracks come from the API (GET /api/catalog/tracks). The frontend keeps
// only presentation content here: editorial mixes, illustrative communities and
// the browser-local preview library.
export type Track = { id: string; slug: string; title: string; artist: string; genre: string; genres: string[]; cover: string; src: string; duration: number; local?: boolean };
export type ApiTrack = { id: string; slug: string; title: string; artist: { id: string; name: string }; genres: string[]; durationMs: number; audioUrl: string | null; coverUrl: string | null };
export const FALLBACK_COVER = '/art/cover-7.svg';
export function fromApiTrack(track: ApiTrack): Track {
  return { id: track.id, slug: track.slug, title: track.title, artist: track.artist.name, genre: track.genres[0] ?? 'Unsorted', genres: track.genres, cover: track.coverUrl ?? FALLBACK_COVER, src: track.audioUrl ?? '', duration: track.durationMs / 1000 };
}
// Editorial mixes reference tracks by stable slug; missing slugs are skipped.
export const mixes = [
  { id: 'late', title: 'After hours', subtitle: 'A softer side of the night.', cover: '/art/cover-1.svg', slugs: ['study-1','study-7','study-4','study-2'] },
  { id: 'focus', title: 'In your own world', subtitle: 'Find your flow. Stay a while.', cover: '/art/cover-5.svg', slugs: ['study-5','study-1','study-6','study-3'] },
  { id: 'sun', title: 'Golden state', subtitle: 'A little warmth for your day.', cover: '/art/cover-0.svg', slugs: ['study-0','study-6','study-4','study-5'] },
  { id: 'blue', title: 'Blue hour club', subtitle: 'For the beautifully unhurried.', cover: '/art/cover-7.svg', slugs: ['study-7','study-3','study-1','study-6'] },
];
export const communities = [
  { id:'indie', title:'The Indie Collective', category:'Indie', tag:'FIND YOUR PEOPLE', description:'For the deep cuts, the small stages, and the songs you wish you found sooner.', cover:4, members:'1.2k', topics:['Hidden gems','Album conversations','New discoveries'] },
  { id:'night', title:'After Hours', category:'Electronic', tag:'STAY UP A LITTLE LONGER', description:'Electronic textures, late-night discoveries, and a shared love for the dance floor.', cover:1, members:'860', topics:['Night drives','Production','Weekly mixes'] },
  { id:'jazz', title:'Jazz, Unscripted', category:'Jazz', tag:'ROOM FOR IMPROVISATION', description:'From familiar standards to unexpected new directions. Pull up a chair.', cover:6, members:'640', topics:['Listening room','Instruments','Essential records'] },
  { id:'armenia', title:'Sounds of Armenia', category:'Regional', tag:'CLOSER TO HOME', description:'A place to explore Armenia’s musical scenes, emerging voices, and shared roots.', cover:5, members:'420', topics:['Local discoveries','Live music','Armenian artists'] },
];
export type Playlist = { id: string; title: string; trackIds: string[] };
export type Library = { liked: string[]; playlists: Playlist[]; joined: string[] };
export function readLibrary(key: string): Library {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(item => typeof item === 'string');
    if (value && strings(value.liked) && strings(value.joined) && Array.isArray(value.playlists) && value.playlists.every((p: Playlist) => p && typeof p.id === 'string' && typeof p.title === 'string' && strings(p.trackIds))) return value;
  } catch { /* An unavailable or older browser store starts with an empty library. */ }
  return { liked: [], playlists: [], joined: [] };
}
// Before the database catalog, the preview stored track IDs such as "study-0".
// Those are now slugs; replace them with the database UUIDs once the catalog
// loads. Unknown IDs are kept (never silently dropped) and duplicates removed.
// Returns the same object when nothing changes, so React skips a re-render.
export function migrateLegacyLibrary(library: Library, catalog: Pick<Track, 'id' | 'slug'>[]): Library {
  const bySlug = new Map(catalog.map(track => [track.slug, track.id]));
  let changed = false;
  const convert = (ids: string[]) => {
    const next = Array.from(new Set(ids.map(id => bySlug.get(id) ?? id)));
    if (next.length !== ids.length || next.some((id, index) => id !== ids[index])) changed = true;
    return next;
  };
  const liked = convert(library.liked);
  const playlists = library.playlists.map(list => ({ ...list, trackIds: convert(list.trackIds) }));
  return changed ? { ...library, liked, playlists } : library;
}
export const formatTime = (seconds: number) => `${Math.floor((Number.isFinite(seconds) ? seconds : 0)/60)}:${String(Math.floor((Number.isFinite(seconds) ? seconds : 0)%60)).padStart(2,'0')}`;
