import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Icon } from './Icon';

type Origin = 'REAL' | 'SYNTHETIC';
type Share = { genre: string; share: number; count: number };
type TrackRef = { id: string; title: string; artist: string; slug: string };
type TrendRow = { track: TrackRef; U0: number; U1: number; growth: number; rawGrowth: number | null; newEntry: boolean; likeRate: number; repeatRate: number; weights: Record<string, number>; percentiles: Record<string, number>; audienceFactor: number; score: number };
type PulseData = {
  origin: Origin; label: string; suppressed: boolean; comparisonBase: string;
  windows: { current: { start: string; end: string }; previous: { start: string; end: string } };
  region: { code: string; name: string } | null;
  rules: { minimumListeners: number; minimumTrendListeners: number; dailyCap: number };
  summary: { listeners: number; previousListeners: number | null; listens: number } | null;
  genres: { shares: Share[]; uncategorized: number } | null;
  daily: { day: string; listeners: number | null; average7: number | null }[] | null;
  trending: TrendRow[]; popular: { track: TrackRef; listeners: number }[];
  regions: { code: string; name: string; listeners: number | null; suppressed: boolean; distance: number | null }[];
  dataset: { generatorVersion: string; seed: number; referenceDate: string } | null;
};
const COLORS = ['#c5e99b', '#bba1df', '#ecb0a5', '#e5c881', '#9fd3d0', '#d9a3c7'];
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
// Windows are half-open [start, end): the last included day is end − 1 day.
const span = (window: { start: string; end: string }) => `${day(window.start)} – ${day(new Date(new Date(window.end).getTime() - 86_400_000).toISOString())} (UTC)`;
const percent = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;

export function Pulse({ openTrack }: { openTrack?: (slug: string) => void }) {
  const [origin, setOrigin] = useState<Origin>('SYNTHETIC');
  const [region, setRegion] = useState('');
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { api<{ regions: { code: string; name: string }[] }>('/pulse/regions').then(result => setRegions(result.regions)).catch(() => setRegions([])); }, []);
  useEffect(() => {
    let cancelled = false;
    setError('');
    api<{ pulse: PulseData }>(`/pulse?origin=${origin}${region ? `&region=${region}` : ''}`)
      .then(result => { if (!cancelled) setData(result.pulse); })
      .catch(failure => { if (!cancelled) { setData(null); setError(failure instanceof ApiError && failure.status === 404 && origin === 'SYNTHETIC' ? 'The synthetic demonstration dataset has not been generated yet. Run npm run db:synthetic, then try again.' : failure instanceof Error ? failure.message : 'Music Pulse is unavailable.'); } });
    return () => { cancelled = true; };
  }, [origin, region, attempt]);

  const place = data?.region?.name ?? 'all regions';
  const threshold = data?.rules.minimumListeners ?? 10;
  const daily = data?.daily ?? [];
  const peak = Math.max(1, ...daily.map(point => Math.max(point.listeners ?? 0, point.average7 ?? 0)));
  const x = (index: number) => 15 + (index * 540) / Math.max(1, daily.length - 1);
  const y = (value: number) => 190 - (value / peak) * 160;
  const averageLine = daily.map((point, index) => point.average7 === null ? null : `${x(index)},${y(point.average7)}`).filter(Boolean).join(' ');

  return <>
    <div className="page-heading"><div><p className="eyebrow">THE SOUND OF RIGHT NOW</p><h1>Music Pulse<span>.</span></h1><p className="muted">How music moves through places and people.</p></div>
      <span className={`preview-tag ${origin === 'SYNTHETIC' ? '' : 'real-tag'}`}><Icon name="pulse" size={14}/> {origin === 'SYNTHETIC' ? 'Synthetic demonstration' : 'Our platform'}</span></div>
    <div className="pulse-filters">
      <label><Icon name="globe" size={17}/><select value={region} onChange={event => setRegion(event.target.value)} aria-label="Analytics region"><option value="">All regions</option>{regions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <div className="segmented" role="group" aria-label="Data source">{([['SYNTHETIC', 'Synthetic demonstration'], ['REAL', 'Our platform']] as const).map(([value, label]) => <button key={value} className={origin === value ? 'active' : ''} aria-pressed={origin === value} onClick={() => setOrigin(value)}>{label}</button>)}</div>
    </div>
    {error ? <div className="empty-state" role="alert"><Icon name="pulse" size={32}/><h3>Music Pulse didn’t load.</h3><p>{error}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>Try again <Icon name="arrow" size={16}/></button></div>
    : !data ? <div className="empty-state" role="status"><Icon name="pulse" size={32}/><h3>Reading the pulse…</h3><p>Aggregating counted listens.</p></div>
    : <>
      <p className="muted small pulse-window">{data.label} · this week {span(data.windows.current)} vs. previous week {span(data.windows.previous)}{data.dataset ? ` · dataset ${data.dataset.generatorVersion}, seed ${data.dataset.seed}` : ''}{data.origin === 'REAL' ? ' · complete days only, so today’s listens appear tomorrow' : ''}</p>
      {data.suppressed ? <div className="empty-state" role="status"><Icon name="users" size={32}/><h3>Not enough listeners in {place} yet.</h3><p>To protect privacy, Music Pulse shows nothing about a group until at least {threshold} different people have counted listens there in the week{data.origin === 'REAL' ? ' — and only people who chose to share their country count towards a region' : ''}.</p></div> : <>
        <div className="stat-grid">
          <article className="stat-card"><span>Listeners this week</span><strong>{data.summary!.listeners.toLocaleString()}</strong><small>{data.summary!.previousListeners === null ? `Previous week: fewer than ${threshold}` : `Previous week: ${data.summary!.previousListeners.toLocaleString()}`}</small></article>
          <article className="stat-card"><span>Counted listens</span><strong>{data.summary!.listens.toLocaleString()}</strong><small>Policy listen-v1 · {place}</small></article>
          <article className="stat-card"><span>Leading genre</span><strong>{data.genres!.shares[0]?.genre ?? '—'}</strong><small>{data.genres!.shares[0] ? `${percent(data.genres!.shares[0].share)} of capped listening` : 'No genre data'}</small></article>
        </div>
        <div className="analytics-grid">
          <article className="panel chart-panel"><div className="section-title"><div><h2>Listeners, day by day</h2><p>Daily unique listeners (dots) and 7-day moving average (line) · {place}</p></div><span className="chart-legend"><i/> 7-day average</span></div>
            <svg className="line-chart" viewBox="0 0 585 210" role="img" aria-label={`Daily unique listeners over the last ${daily.length} days in ${place}`}><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d3f99a" stopOpacity=".3"/><stop offset="1" stopColor="#d3f99a" stopOpacity="0"/></linearGradient></defs>
              {[40, 90, 140, 190].map(level => <line key={level} x1="15" y1={level} x2="555" y2={level} stroke="#303036" strokeDasharray="4 6"/>)}
              {averageLine && <polyline points={averageLine} fill="none" stroke="#d3f99a" strokeWidth="3" strokeLinejoin="round"/>}
              {daily.map((point, index) => point.listeners === null ? null : <circle key={point.day} cx={x(index)} cy={y(point.listeners)} r="2.6" fill="#bba1df"><title>{`${day(point.day)}: ${point.listeners} listeners`}</title></circle>)}</svg>
            <div className="chart-axis">{daily.length ? [daily[0]!, daily[Math.floor(daily.length / 2)]!, daily[daily.length - 1]!].map(point => <span key={point.day}>{day(point.day)}</span>) : null}</div>
            {daily.some(point => point.listeners === null) && <p className="muted small">Days with fewer than {threshold} listeners are not shown.</p>}</article>
          <article className="panel"><h2>A taste of {place}</h2><p className="muted">Genre shares of this week’s listening (at most {data.rules.dailyCap} listens per person, track and day)</p>
            <div className="genre-bars">{data.genres!.shares.map((item, index) => <div key={item.genre}><div><span>{item.genre}</span><strong>{percent(item.share)}</strong></div><div className="bar-track"><i style={{ width: `${item.share * 100}%`, background: COLORS[index % COLORS.length] }}/></div></div>)}</div>
            {data.genres!.uncategorized > 0 && <p className="muted small">{data.genres!.uncategorized} listens of tracks without a genre are excluded.</p>}</article>
        </div>
        <section className="panel pulse-section"><div className="section-title"><div><h2>Trending now</h2><p>trend = 100 · U1/(U1+50) · Σ weight × percentile(signal) · tracks with at least {data.rules.minimumTrendListeners} listeners this week</p></div></div>
          {data.trending.length ? <div className="pulse-table" role="table" aria-label="Trending tracks"><div role="row" className="pulse-row head"><span>#</span><span>Track</span><span title="Unique listeners previous → this week">U0 → U1</span><span title="Smoothed growth (U1−U0)/(U0+20)">Growth g</span><span>Like rate</span><span title="Share of this week's listeners with 2+ counted listens">Repeat</span><span>Score</span></div>
            {data.trending.map((row, index) => <div role="row" className="pulse-row" key={row.track.id}><span>{index + 1}</span><span>{data.origin === 'REAL' && openTrack ? <button className="link-button" onClick={() => openTrack(row.track.slug)}>{row.track.title}</button> : row.track.title}<small>{row.track.artist}</small></span><span>{row.newEntry ? `new → ${row.U1}` : `${row.U0} → ${row.U1}`}</span><span>{row.growth.toFixed(2)}{row.rawGrowth !== null && <small>raw {percent(row.rawGrowth)}</small>}</span><span>{percent(row.likeRate)}</span><span>{percent(row.repeatRate)}</span><span><strong>{row.score.toFixed(1)}</strong></span></div>)}</div>
            : <p className="muted">No track has {data.rules.minimumTrendListeners} or more listeners this week{data.region ? ` in ${place}` : ''}, so nothing is ranked. Small audiences make growth numbers unreliable.</p>}
          {data.trending[0] && <p className="muted small">Weights used: {Object.entries(data.trending[0].weights).map(([signal, weight]) => `${signal} ${weight.toFixed(2)}`).join(', ')}. The playlist-add signal is left out until playlist additions are recorded with timestamps; its weight is shared out proportionally.</p>}
        </section>
        <div className="analytics-grid">
          <section className="panel"><h2>Most listened</h2><p className="muted">Unique listeners this week · current popularity, not momentum</p>
            {data.popular.length ? <ol className="pulse-list">{data.popular.map(row => <li key={row.track.id}><span>{row.track.title}<small>{row.track.artist}</small></span><strong>{row.listeners.toLocaleString()}</strong></li>)}</ol> : <p className="muted small">No track has {threshold} or more listeners yet.</p>}</section>
          <section className="panel"><h2>Regions compared</h2><p className="muted">{data.comparisonBase} · total variation distance, 0 = same genre mix, 1 = completely different</p>
            <ol className="pulse-list">{data.regions.map(item => <li key={item.code}><span>{item.name}<small>{item.suppressed ? `fewer than ${threshold} listeners — hidden` : `${item.listeners!.toLocaleString()} listeners`}</small></span><strong>{item.distance === null ? '—' : item.distance.toFixed(2)}</strong></li>)}</ol></section>
        </div>
      </>}
      <div className="info-strip"><Icon name="pulse"/><p>{data.origin === 'SYNTHETIC'
        ? <><strong>Synthetic demonstration.</strong> Generated listeners with planted patterns (a breakout, steady hits, a one-day spike, regional tastes), stored separately and never mixed with real data. It shows how the models behave, not how people listen. See docs/EVALUATION-PULSE.md.</>
        : <><strong>Our platform.</strong> Built only from counted listens of real accounts. Regions include only people who chose to share their country (Profile). Groups smaller than {threshold} people are never shown.</>}</p></div>
    </>}
  </>;
}
