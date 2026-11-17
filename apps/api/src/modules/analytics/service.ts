import type { PrismaClient } from '@prisma/client';
import { DAY_MS, utcDayStart } from './math.js';
import { computePulse, type Origin, type PulseResult, type TrackRef } from './pulse.js';

export class PulseError extends Error { constructor(public code: 'NO_DATASET' | 'UNKNOWN_REGION', message: string) { super(message); } }
export type DatasetInfo = { generatorVersion: string; seed: number; referenceDate: string; createdAt: string };
export type PulseService = {
  regions(): Promise<{ code: string; name: string }[]>;
  pulse(origin: Origin, regionCode: string | null): Promise<PulseResult & { dataset: DatasetInfo | null }>;
};

// Loads one origin's rows for the 34 days before the window close and hands them to the
// pure computePulse. Real data closes at today's UTC midnight (complete days only);
// synthetic data closes at the dataset's fixed reference date, so it never drifts.
export function pulseService(database: PrismaClient, now: () => number = Date.now): PulseService {
  return {
    async regions() { return database.region.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } }); },
    async pulse(origin, regionCode) {
      const regions = await database.region.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } });
      if (regionCode && !regions.some(region => region.code === regionCode)) throw new PulseError('UNKNOWN_REGION', 'Unknown region');
      let end = now();
      let dataset: DatasetInfo | null = null;
      if (origin === 'SYNTHETIC') {
        const row = await database.syntheticDataset.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!row) throw new PulseError('NO_DATASET', 'No synthetic dataset yet. Run npm run db:synthetic.');
        end = row.referenceDate.getTime();
        dataset = { generatorVersion: row.generatorVersion, seed: row.seed, referenceDate: row.referenceDate.toISOString(), createdAt: row.createdAt.toISOString() };
      }
      const close = utcDayStart(end), from = close - 34 * DAY_MS;
      const window = { gte: new Date(from), lt: new Date(close) };
      const [events, likes] = await Promise.all([
        database.listeningEvent.findMany({ where: { dataOrigin: origin, occurredAt: window }, select: { userId: true, trackId: true, occurredAt: true, regionId: true } }),
        database.like.findMany({ where: { createdAt: { gte: new Date(close - 7 * DAY_MS), lt: new Date(close) }, user: { dataOrigin: origin }, track: { dataOrigin: origin } }, select: { userId: true, trackId: true, createdAt: true } }),
      ]);
      const trackIds = [...new Set(events.map(event => event.trackId))];
      const tracks = await database.track.findMany({
        where: { id: { in: trackIds }, dataOrigin: origin },
        select: { id: true, title: true, slug: true, artist: { select: { name: true } }, genres: { select: { genre: { select: { name: true } } } } },
      });
      const result = computePulse({
        origin, end, regions, regionCode,
        events: events.map(event => ({ userId: event.userId, trackId: event.trackId, at: event.occurredAt.getTime(), regionId: event.regionId })),
        likes: likes.map(like => ({ userId: like.userId, trackId: like.trackId, at: like.createdAt.getTime() })),
        tracks: new Map<string, TrackRef>(tracks.map(track => [track.id, { id: track.id, title: track.title, artist: track.artist.name, slug: track.slug }])),
        trackGenres: new Map(tracks.map(track => [track.id, track.genres.map(item => item.genre.name)])),
      });
      return { ...result, dataset };
    },
  };
}
