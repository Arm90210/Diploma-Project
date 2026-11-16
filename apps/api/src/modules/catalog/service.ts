import type { Prisma, PrismaClient } from '@prisma/client';
import { toCatalogTrack, type CatalogTrack, type GenreSummary, type TrackPage, type TrackQuery } from './contract.js';

const trackSelect = {
  id: true, slug: true, title: true, durationMs: true, audioKey: true, coverKey: true,
  artist: { select: { id: true, name: true } },
  genres: { select: { genre: { select: { name: true } } }, orderBy: { genre: { name: 'asc' } } },
} satisfies Prisma.TrackSelect;

export type CatalogService = {
  listTracks(query: TrackQuery): Promise<TrackPage>;
  getTrack(ref: { id: string } | { slug: string }): Promise<CatalogTrack | null>;
  listGenres(): Promise<GenreSummary[]>;
};

// The public catalog serves REAL tracks only. SYNTHETIC evaluation data must be
// requested explicitly by future analytics code, never blended in here.
export function catalogService(database: PrismaClient): CatalogService {
  return {
    async listTracks({ q, genre, limit, offset }) {
      const filters: Prisma.TrackWhereInput[] = [];
      if (q) filters.push({ OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { artist: { name: { contains: q, mode: 'insensitive' } } },
        { genres: { some: { genre: { name: { contains: q, mode: 'insensitive' } } } } },
      ] });
      if (genre) filters.push({ genres: { some: { genre: { name: { equals: genre, mode: 'insensitive' } } } } });
      const where: Prisma.TrackWhereInput = { dataOrigin: 'REAL', AND: filters };
      const [rows, total] = await database.$transaction([
        // Slug breaks ties between rows created in the same transaction, keeping pages stable.
        database.track.findMany({ where, select: trackSelect, orderBy: [{ createdAt: 'asc' }, { slug: 'asc' }], take: limit, skip: offset }),
        database.track.count({ where }),
      ]);
      return { tracks: rows.map(toCatalogTrack), total, limit, offset };
    },
    async getTrack(ref) {
      const row = await database.track.findFirst({ where: { ...ref, dataOrigin: 'REAL' }, select: trackSelect });
      return row ? toCatalogTrack(row) : null;
    },
    async listGenres() {
      const genres = await database.genre.findMany({
        select: { name: true, _count: { select: { tracks: { where: { track: { dataOrigin: 'REAL' } } } } } },
        orderBy: { name: 'asc' },
      });
      return genres.map(item => ({ name: item.name, trackCount: item._count.tracks })).filter(item => item.trackCount > 0);
    },
  };
}
