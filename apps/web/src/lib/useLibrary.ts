import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type User } from './api';
import { migrateLegacyLibrary, readLibrary, type Library, type Track } from './catalog';
import type { Collections } from './libraryImport';
import type { CatalogState } from './useCatalog';
import { importPayload } from './libraryImport';

type ServerLibrary = { likedTrackIds: string[]; playlists: { id: string; title: string; isPublic: boolean; trackIds: string[] }[] };
// 'local': guest, stored in this browser. Otherwise the account library from the API.
export type LibraryStatus = 'local' | 'loading' | 'ready' | 'error';

const fromServer = (library: ServerLibrary): Collections => ({ liked: library.likedTrackIds, playlists: library.playlists.map(({ id, title, trackIds }) => ({ id, title, trackIds })) });
export function useLibrary(user: User | null, catalog: Pick<CatalogState, 'status' | 'tracks'>, notify: (message: string) => void) {
  // Guests: likes, playlists and joined communities in this browser (as before).
  // Signed in: likes and playlists in PostgreSQL; joined communities stay browser-local
  // until the communities step. The browser store is kept per account ID.
  const storageKey = `musicsphere-preview-v1:${user?.id ?? 'guest'}`;
  const [local, setLocal] = useState<Library>(() => readLibrary(storageKey));
  const [server, setServer] = useState<Collections | null>(null);
  const [status, setStatus] = useState<LibraryStatus>(user ? 'loading' : 'local');
  const [attempt, setAttempt] = useState(0);
  const importing = useRef(false);

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(local)); } catch { notify('Browser storage is unavailable. This collection will last for this visit.'); } }, [local, storageKey, notify]);
  useEffect(() => { if (catalog.status === 'ready') setLocal(value => migrateLegacyLibrary(value, catalog.tracks)); }, [catalog.status, catalog.tracks]);

  const refresh = useCallback(async () => {
    try { setServer(fromServer((await api<{ library: ServerLibrary }>('/library')).library)); }
    catch { /* keep what is shown; the next action or reload will try again */ }
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setStatus('loading');
    api<{ library: ServerLibrary }>('/library')
      .then(result => { if (!cancelled) { setServer(fromServer(result.library)); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [user?.id, attempt]);

  // One-time move of this account's browser-stored collection into the account.
  // The browser copy is cleared only after the server confirms the import.
  useEffect(() => {
    if (!user || status !== 'ready' || catalog.status !== 'ready' || importing.current) return;
    const pending = migrateLegacyLibrary(local, catalog.tracks);
    if (!pending.liked.length && !pending.playlists.length) return;
    importing.current = true;
    api<{ library: ServerLibrary }>('/library/import', 'POST', importPayload(pending))
      .then(result => { setServer(fromServer(result.library)); setLocal(value => ({ ...value, liked: [], playlists: [] })); notify('The music you saved in this browser is now in your account.'); })
      // One attempt per visit (no retry loop); the browser copy stays for the next sign-in or reload.
      .catch(() => notify('We couldn’t move this browser’s saved music to your account yet. It’s still kept here and we’ll try again next time.'));
  }, [user, status, catalog.status, catalog.tracks, local, notify]);

  const signedIn = !!user;
  const ready = () => { if (status === 'ready') return true; notify(status === 'error' ? 'Your library is unavailable right now. Try again in a moment.' : 'Your library is still loading.'); return false; };
  // Optimistic change, then the API call; on failure show why and re-sync from the server.
  async function send(change: (value: Collections) => Collections, path: string, method: string, fallback: string) {
    setServer(value => value && change(value));
    try { await api(path, method); return true; }
    catch (error) { notify(error instanceof ApiError && error.status !== 0 && error.status < 500 ? error.message : fallback); void refresh(); return false; }
  }
  const editLocal = (change: (value: Collections) => Collections) => setLocal(value => ({ ...value, ...change(value) }));

  async function toggleLike(track: Track) {
    const change = (value: Collections) => ({ ...value, liked: value.liked.includes(track.id) ? value.liked.filter(id => id !== track.id) : [...value.liked, track.id] });
    if (!signedIn) { editLocal(change); return true; }
    if (!ready()) return false;
    return send(change, `/library/likes/${track.id}`, server?.liked.includes(track.id) ? 'DELETE' : 'PUT', 'Couldn’t update your like. Please try again.');
  }
  async function createPlaylist(title: string): Promise<string | null> {
    if (!signedIn) { const id = crypto.randomUUID(); editLocal(value => ({ ...value, playlists: [...value.playlists, { id, title, trackIds: [] }] })); return id; }
    if (!ready()) return null;
    try {
      const { playlist } = await api<{ playlist: { id: string; title: string; trackIds: string[] } }>('/library/playlists', 'POST', { title });
      setServer(value => value && { ...value, playlists: [...value.playlists, { id: playlist.id, title: playlist.title, trackIds: playlist.trackIds }] });
      return playlist.id;
    } catch (error) { notify(error instanceof Error ? error.message : 'Couldn’t create the playlist.'); return null; }
  }
  async function addTrack(playlistId: string, track: Track) {
    const change = (value: Collections) => ({ ...value, playlists: value.playlists.map(list => list.id === playlistId ? { ...list, trackIds: Array.from(new Set([...list.trackIds, track.id])) } : list) });
    if (!signedIn) { editLocal(change); return true; }
    if (!ready()) return false;
    return send(change, `/library/playlists/${playlistId}/tracks/${track.id}`, 'PUT', 'Couldn’t add the track. Please try again.');
  }
  async function removeTrack(playlistId: string, trackId: string) {
    const change = (value: Collections) => ({ ...value, playlists: value.playlists.map(list => list.id === playlistId ? { ...list, trackIds: list.trackIds.filter(id => id !== trackId) } : list) });
    if (!signedIn) { editLocal(change); return true; }
    if (!ready()) return false;
    return send(change, `/library/playlists/${playlistId}/tracks/${trackId}`, 'DELETE', 'Couldn’t remove the track. Please try again.');
  }
  async function deletePlaylist(playlistId: string) {
    const change = (value: Collections) => ({ ...value, playlists: value.playlists.filter(list => list.id !== playlistId) });
    if (!signedIn) { editLocal(change); return true; }
    if (!ready()) return false;
    return send(change, `/library/playlists/${playlistId}`, 'DELETE', 'Couldn’t delete the playlist. Please try again.');
  }
  function toggleJoin(communityId: string) {
    setLocal(value => ({ ...value, joined: value.joined.includes(communityId) ? value.joined.filter(id => id !== communityId) : [...value.joined, communityId] }));
  }

  const collections = signedIn ? server ?? { liked: [], playlists: [] } : local;
  const library: Library = { liked: collections.liked, playlists: collections.playlists, joined: local.joined };
  return { library, status, signedIn, retry: () => setAttempt(value => value + 1), toggleLike, createPlaylist, addTrack, removeTrack, deletePlaylist, toggleJoin };
}
export type LibraryState = ReturnType<typeof useLibrary>;
