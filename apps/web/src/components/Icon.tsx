const paths = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  search:'m21 21-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  library:'M4 4v16M9 4v16m5-15 5 15M3 8h7',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  pulse:'M2 12h5l3-8 4 16 3-8h5',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  play:'m8 4 13 8L8 20Z', pause:'M8 5v14M16 5v14', next:'m5 5 10 7-10 7ZM19 5v14', previous:'m19 5-10 7 10 7ZM5 5v14',
  volume:'m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  mute:'m11 5-6 4H2v6h3l6 4Zm5 4 6 6m0-6-6 6',
  plus:'M12 5v14M5 12h14', close:'m6 6 12 12M6 18 18 6', arrow:'M5 12h14m-6-6 6 6-6 6',
  chevron:'m9 5 7 7-7 7', back:'m15 5-7 7 7 7', upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  user:'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  queue:'M3 5h18M3 11h12M3 17h8m6-3 5 3-5 3Z', shuffle:'M3 5h3l12 14h3m-4-4 4 4-4 4M3 19h3l4-5m4-4 4-5h3m-4-4 4 4-4 4',
  repeat:'m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
  check:'m5 12 4 4L19 6', globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 6-5 12 0 18 5-6 5-12 0-18',
  note:'M9 18V5l12-2v13M9 5l12-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  logout:'M9 3H4v18h5m5-14 5 5-5 5M8 12h13', clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  more:'M5 12h.01M12 12h.01M19 12h.01', headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3Zm14 0h4v8h-4Z',
};
export type IconName = keyof typeof paths;
export function Icon({ name, size=20, filled=false }: { name: IconName; size?: number; filled?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
