export type Track = { id: string; title: string; artist: string; genre: string; cover: string; src: string; duration: number; local?: boolean };
export const tracks: Track[] = [
  ['Golden Hour', 'Electronic'], ['Soft Landing', 'Ambient'], ['Night Drive', 'Electronic'], ['Blue Room', 'Jazz'],
  ['Slow Motion', 'Indie'], ['Wildflower', 'Indie'], ['Afterglow', 'Ambient'], ['Moonlight', 'Jazz'],
].map(([title, genre], i) => ({ id: `study-${i}`, title: title!, genre: genre!, artist: 'MusicSphere Studio', cover: `/art/cover-${i}.svg`, src: `/audio/study-${i}.wav`, duration: 24 }));
export const mixes = [
  { id: 'late', title: 'After hours', subtitle: 'A softer side of the night.', cover: 1, ids: ['study-1','study-7','study-4','study-2'] },
  { id: 'focus', title: 'In your own world', subtitle: 'Find your flow. Stay a while.', cover: 5, ids: ['study-5','study-1','study-6','study-3'] },
  { id: 'sun', title: 'Golden state', subtitle: 'A little warmth for your day.', cover: 0, ids: ['study-0','study-6','study-4','study-5'] },
  { id: 'blue', title: 'Blue hour club', subtitle: 'For the beautifully unhurried.', cover: 7, ids: ['study-7','study-3','study-1','study-6'] },
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
export const formatTime = (seconds: number) => `${Math.floor((Number.isFinite(seconds) ? seconds : 0)/60)}:${String(Math.floor((Number.isFinite(seconds) ? seconds : 0)%60)).padStart(2,'0')}`;
