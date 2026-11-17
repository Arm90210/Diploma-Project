import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatTime, type Track } from '../lib/catalog';
import { Icon } from './Icon';

type Stats = { minimumListeners: number; listeners: number | null; listens: number | null; yourListens: number | null };

// Track detail page. Audience numbers are real counted listens (policy listen-v1) and
// are hidden until at least 10 different people have listened (privacy threshold).
export function TrackPage({ track, catalogStatus, signedIn, liked, active, playing, refreshKey, play, like, add, back }: {
  track: Track | undefined; catalogStatus: 'loading' | 'ready' | 'error'; signedIn: boolean; liked: boolean; active: boolean; playing: boolean;
  refreshKey: number; play: () => void; like: () => void; add: () => void; back: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    setFailed(false);
    api<{ stats: Stats }>(`/listening/tracks/${track.id}/stats`)
      .then(result => { if (!cancelled) setStats(result.stats); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [track?.id, refreshKey]);

  if (!track) return <div className="empty-state" role={catalogStatus === 'error' ? 'alert' : 'status'}><Icon name="note" size={32}/>
    <h3>{catalogStatus === 'loading' ? 'Tuning in…' : 'We couldn’t find that track.'}</h3>
    <p>{catalogStatus === 'loading' ? 'Loading the music catalog.' : 'It may have been removed, or the link is incomplete.'}</p>
    <button className="text-button" onClick={back}>Back to Discover <Icon name="chevron" size={16}/></button></div>;

  const shown = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toLocaleString();
  const audience = stats && stats.listeners === null;
  return <>
    <div className="page-heading"><div><p className="eyebrow">TRACK · ORIGINAL DEMO</p><h1>{track.title}<span>.</span></h1>
      <p className="muted">{track.artist} · {track.genres.join(', ')} · {formatTime(track.duration)}</p></div></div>
    <section className="panel track-detail">
      <img src={track.cover} alt=""/>
      <div>
        <div className="track-detail-actions">
          <button className="primary" onClick={play}><Icon name="play" size={16} filled/>{active && playing ? 'Playing' : 'Play'}</button>
          <button className={`secondary ${liked ? 'selected' : ''}`} onClick={like} aria-pressed={liked}><Icon name="heart" size={16} filled={liked}/>{liked ? 'Liked' : 'Like'}</button>
          <button className="secondary" onClick={add}><Icon name="plus" size={16}/>Add to playlist</button>
        </div>
        <div className="stat-grid track-stats">
          <div className="stat-card"><span>Your counted listens</span><strong>{signedIn ? shown(stats?.yourListens) : '—'}</strong><small>{signedIn ? 'Only you can see this' : 'Sign in to count your listens'}</small></div>
          <div className="stat-card"><span>Listeners on MusicSphere</span><strong>{audience ? `< ${stats!.minimumListeners}` : shown(stats?.listeners)}</strong><small>{audience ? 'Shown from 10 listeners' : 'Different people, all time'}</small></div>
          <div className="stat-card"><span>Counted listens on MusicSphere</span><strong>{audience ? '—' : shown(stats?.listens)}</strong><small>Real accounts only</small></div>
        </div>
        {failed && <p className="muted small" role="alert">Listening numbers are unavailable right now.</p>}
        <p className="muted small">A listen counts after 30 seconds of actual playback, or half of a shorter track. Paused time and skipping ahead don’t count, and replaying the same track counts again only after 30 minutes.</p>
      </div>
    </section>
  </>;
}
