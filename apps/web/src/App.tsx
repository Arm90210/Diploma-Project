import { useEffect, useState } from 'react';

type Connection = 'checking' | 'connected' | 'unavailable';

export function App() {
  const [api, setApi] = useState<Connection>('checking');
  const [database, setDatabase] = useState<Connection>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    setApi('checking'); setDatabase('checking');
    async function check(path: string, update: (state: Connection) => void) {
      try {
        const response = await fetch(path, { signal: controller.signal });
        const body = await response.json();
        if (!cancelled) update(response.ok && ['ok', 'ready'].includes(body.status) ? 'connected' : 'unavailable');
      } catch { if (!cancelled) update('unavailable'); }
    }
    let cancelled = false;
    void Promise.all([check('/api/health', setApi), check('/api/ready', setDatabase)])
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-mark">≋</span> resonance<span className="brand-dot">.</span></a>
      <div className="nav-label">YOUR MUSIC, IN CONTEXT</div>
      <a className="nav-item active" href="#main"><span aria-hidden="true">◈</span> Overview</a>
      <a className="nav-item" href="#roadmap"><span aria-hidden="true">↗</span> Development roadmap</a>
      <div className="sidebar-note"><span className="live-dot" /> DIPLOMA PROJECT<p>Music preference & demand dynamics analysis.</p></div>
    </aside>
    <main id="main">
      <header><span>WORKSPACE <span className="muted">/ Overview</span></span><span className="phase-tag">PHASE 01 · FOUNDATION</span></header>
      <section className="hero">
        <p className="eyebrow">A LITTLE MORE THAN LISTENING</p>
        <h1>Every listen.<br /><span>A new perspective.</span></h1>
        <p className="hero-copy">A music platform built to explore what we love, how tastes change, and where the next wave begins.</p>
        <a className="primary-link" href="#roadmap">Explore the project <span aria-hidden="true">↗</span></a>
        <div className="sound-wave" aria-hidden="true">{[22, 48, 34, 72, 100, 56, 86, 120, 78, 48, 96, 66, 40, 60, 24].map((height, i) => <i key={i} style={{ height }} />)}</div>
      </section>
      <section className="status-section" aria-labelledby="status-title">
        <div className="section-heading"><div><p className="eyebrow">THE STARTING POINT</p><h2 id="status-title">Your foundation is taking shape.</h2></div><button onClick={() => setAttempt(value => value + 1)}>Check connections ↻</button></div>
        <div className="status-grid">
          <Status title="Frontend" status="connected" detail="React · TypeScript · Vite" />
          <Status title="Backend API" status={api} detail="Express · TypeScript" />
          <Status title="Database" status={database} detail="PostgreSQL · Prisma" />
        </div>
        <p className="disclosure">Connection checks reflect this local environment. Database readiness checks connectivity; migrations must also be applied. Music uploads, playback, and analytics arrive in later phases. No listening data has been collected.</p>
      </section>
      <section id="roadmap" aria-labelledby="roadmap-title"><div className="section-heading"><div><p className="eyebrow">BUILT ONE PHASE AT A TIME</p><h2 id="roadmap-title">From sound to understanding.</h2></div></div>
        <div className="roadmap-grid">{[
          ['01', 'The foundation', 'Project structure, database design, and connected services.', 'CURRENT PHASE'],
          ['02–03', 'The listening experience', 'Accounts, licensed uploads, playback, playlists, and likes.', 'UP NEXT'],
          ['04–06', 'The mathematics', 'Listening events, regional trends, and explainable recommendations.', 'PLANNED'],
          ['07', 'Ready to defend', 'Evaluation, performance checks, documentation, and demonstration.', 'PLANNED'],
        ].map(([number, title, description, state]) => <article className="roadmap-card" key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p><small>{state}</small></article>)}</div>
      </section>
      <footer><span>RESONANCE / APPLIED MATHEMATICS</span><span>Platform data only. Privacy by design.</span></footer>
    </main>
  </div>;
}

function Status({ title, status, detail }: { title: string; status: Connection; detail: string }) {
  return <article className="status-card"><div className="status-top"><h3>{title}</h3><span className={`indicator ${status}`} aria-hidden="true" /></div><p>{detail}</p><span className={`status-text ${status}`} role="status">{status === 'connected' ? 'Connected' : status === 'checking' ? 'Checking…' : 'Unavailable — see setup guide'}</span></article>;
}
