import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { WorldMap } from './WorldMap';

type Location = { region: { code: string; name: string } | null; consentedAt: string | null };

// Optional, explicit, country-level location for regional Music Pulse charts.
// Choosing requires ticking consent each time; withdrawing also removes the country
// from all past listens.
export function RegionConsent() {
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);
  const [current, setCurrent] = useState<Location | null>(null);
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ regions: { code: string; name: string }[] }>('/pulse/regions').then(result => setRegions(result.regions)).catch(() => setError('Regions are unavailable right now.'));
    api<Location>('/location').then(result => { setCurrent(result); setCode(result.region?.code ?? ''); }).catch(() => setError('Your location setting is unavailable right now.'));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!code || !consent) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await api<Location>('/location', 'PUT', { code, consent: true }); setCurrent(result); setConsent(false); setMessage(`Saved. Your future counted listens count towards ${result.region?.name}.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await api<Location & { clearedEvents: number }>('/location', 'DELETE'); setCurrent(result); setCode(''); setMessage(`Withdrawn. Your country was removed from your profile and from ${result.clearedEvents} past listen${result.clearedEvents === 1 ? '' : 's'}.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="panel region-panel"><p className="eyebrow">OPTIONAL · YOUR CHOICE</p><h2>Your country in Music Pulse</h2>
    <p className="muted">If you share your country, your counted listens add to that country’s regional charts. Nothing is shown about any group smaller than 10 people. No GPS or IP address is used — only the country you pick here.</p>
    {current?.region ? <p className="notice" role="status">Sharing: <strong>{current.region.name}</strong>{current.consentedAt ? ` since ${new Date(current.consentedAt).toLocaleDateString()}` : ''}.</p> : <p className="muted small">You are not sharing a country.</p>}
    <form className="region-choice" onSubmit={save}>
      <WorldMap fill={country => country === code ? '#d3f99a' : '#4b3d57'} selected={code || null} onSelect={setCode} markers={code ? [code] : []}
        describe={(_, name) => `${name} — click to choose`} label="World map for choosing your country. The list below offers the same choice."/>
      <select value={code} onChange={event => setCode(event.target.value)} aria-label="Country"><option value="">Choose a country (or click the map)…</option>{regions.map(region => <option key={region.code} value={region.code}>{region.name}</option>)}</select>
      <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I agree that MusicSphere records this country with my future counted listens for regional statistics. I can withdraw at any time.</span></label>
      {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
      <div className="track-detail-actions"><button className="primary" disabled={busy || !code || !consent}>{current?.region ? 'Update country' : 'Share country'}<Icon name="check" size={16}/></button>
        {current?.region && <button type="button" className="secondary" disabled={busy} onClick={withdraw}>Withdraw and remove from past listens</button>}</div>
    </form>
  </section>;
}
