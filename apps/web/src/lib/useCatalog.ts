import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { fromApiTrack, type ApiTrack, type Track } from './catalog';

export type CatalogState = { status: 'loading' | 'ready' | 'error'; tracks: Track[]; message: string; retry: () => void };
// The demo catalog fits in one page (the API allows up to 100 per request).
// Pagination/server search UI can be added when the catalog grows.
export function useCatalog(): CatalogState {
  const [state, setState] = useState<Omit<CatalogState, 'retry'>>({ status: 'loading', tracks: [], message: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(value => ({ ...value, status: 'loading', message: '' }));
    api<{ tracks: ApiTrack[] }>('/catalog/tracks?limit=100')
      .then(result => { if (!cancelled) setState({ status: 'ready', tracks: result.tracks.map(fromApiTrack), message: '' }); })
      .catch(error => { if (!cancelled) setState({ status: 'error', tracks: [], message: error instanceof Error ? error.message : 'The music catalog is unavailable.' }); });
    return () => { cancelled = true; };
  }, [attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}
