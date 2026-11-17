import type { Library } from './catalog';
// Pure helpers for moving a browser-stored collection into an account
// (POST /api/library/import). No React, so they run under Node's test runner.
export type Collections = Pick<Library, 'liked' | 'playlists'>;
// Browser-stored titles predate server validation; make them acceptable (1–80 characters).
export function importTitle(title: string): string {
  const clean = [...title.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim()].slice(0, 80).join('').trim();
  return clean || 'Imported playlist';
}
// Shape the browser collection for POST /api/library/import within the server's
// bounds: ≤1000 likes, ≤100 playlists, ≤500 tracks each, ≤2000 references in total.
export function importPayload(library: Collections) {
  const liked = library.liked.slice(0, 1000);
  let budget = 2000 - liked.length;
  const playlists = library.playlists.slice(0, 100).map(list => {
    const trackIds = list.trackIds.slice(0, Math.min(500, Math.max(0, budget)));
    budget -= trackIds.length;
    return { title: importTitle(list.title), trackIds };
  });
  return { liked, playlists };
}
