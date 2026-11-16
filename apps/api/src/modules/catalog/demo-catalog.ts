// The original demo catalog: eight 24-second studies synthesized by
// scripts/generate-demo-assets.py (22.05 kHz mono WAV) with matching SVG covers.
// These are real, playable catalog entries (dataOrigin REAL). "Synthesized audio"
// is not the same as SYNTHETIC analytics data, which is reserved for generated
// users and listening events used in evaluation.

// Fixed so repeated seeding updates the same artist row instead of creating copies
// (Artist names are deliberately not unique in the schema).
export const DEMO_ARTIST = { id: '6f3a2c1e-9b7d-4c5e-8a1f-2d3b4c5e6f70', name: 'MusicSphere Studio' } as const;

export const DEMO_RIGHTS_STATEMENT =
  'Original audio study synthesized for MusicSphere by scripts/generate-demo-assets.py; no third-party recordings or artwork.';

export type DemoTrack = { slug: string; title: string; genre: string; durationMs: number; audioKey: string; coverKey: string };

const studies: [title: string, genre: string][] = [
  ['Golden Hour', 'Electronic'], ['Soft Landing', 'Ambient'], ['Night Drive', 'Electronic'], ['Blue Room', 'Jazz'],
  ['Slow Motion', 'Indie'], ['Wildflower', 'Indie'], ['Afterglow', 'Ambient'], ['Moonlight', 'Jazz'],
];

// Slugs match the identifiers the preview frontend stored in localStorage
// ("study-0" … "study-7"), so earlier likes/playlists can be migrated.
export const DEMO_TRACKS: DemoTrack[] = studies.map(([title, genre], index) => ({
  slug: `study-${index}`,
  title,
  genre,
  durationMs: 24_000,
  audioKey: `static/audio/study-${index}.wav`,
  coverKey: `static/art/cover-${index}.svg`,
}));
