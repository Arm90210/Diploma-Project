import type { PrismaClient } from '@prisma/client';
import { DEMO_ARTIST, DEMO_RIGHTS_STATEMENT, DEMO_TRACKS } from './demo-catalog.js';

// Idempotent: run it any number of times. Rows are matched by fixed artist ID,
// unique genre name and unique track slug, so track UUIDs (and anything that
// references them, such as likes) survive re-seeding. Only demo rows are touched;
// nothing else in the catalog is modified or deleted. One transaction: all or nothing.
export async function seedDemoCatalog(database: PrismaClient) {
  return database.$transaction(async tx => {
    await tx.artist.upsert({ where: { id: DEMO_ARTIST.id }, create: { ...DEMO_ARTIST }, update: { name: DEMO_ARTIST.name } });
    const genreIds = new Map<string, string>();
    for (const name of new Set(DEMO_TRACKS.map(track => track.genre))) {
      const genre = await tx.genre.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
      genreIds.set(name, genre.id);
    }
    let created = 0;
    let updated = 0;
    for (const demo of DEMO_TRACKS) {
      const data = {
        title: demo.title, artistId: DEMO_ARTIST.id, durationMs: demo.durationMs, audioKey: demo.audioKey,
        coverKey: demo.coverKey, rightsStatement: DEMO_RIGHTS_STATEMENT, dataOrigin: 'REAL' as const,
      };
      const existing = await tx.track.findUnique({ where: { slug: demo.slug }, select: { id: true } });
      const track = existing
        ? await tx.track.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.track.create({ data: { slug: demo.slug, ...data }, select: { id: true } });
      if (existing) updated++; else created++;
      await tx.trackGenre.deleteMany({ where: { trackId: track.id } });
      await tx.trackGenre.create({ data: { trackId: track.id, genreId: genreIds.get(demo.genre)! } });
    }
    return { tracks: DEMO_TRACKS.length, created, updated };
  });
}
