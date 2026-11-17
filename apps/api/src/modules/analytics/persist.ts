import type { Prisma, PrismaClient } from '@prisma/client';
import { COUNTRIES } from './countries.js';
import { GENERATOR_VERSION, GENRES, type SyntheticDataset } from './synthetic.js';

type Tx = Prisma.TransactionClient;

/** Regions are reference data shared by real and synthetic users: every country on the map
 * (ISO 3166-1 alpha-2, from Natural Earth via scripts/build-world-map.py). Idempotent. */
export async function seedRegions(client: Tx | PrismaClient) {
  const existing = new Map((await client.region.findMany({ select: { code: true, name: true } })).map(region => [region.code, region.name]));
  const missing = COUNTRIES.filter(country => !existing.has(country.code));
  if (missing.length) await client.region.createMany({ data: missing.map(country => ({ code: country.code, name: country.name, countryCode: country.code })), skipDuplicates: true });
  for (const country of COUNTRIES) {
    if (existing.has(country.code) && existing.get(country.code) !== country.name) await client.region.update({ where: { code: country.code }, data: { name: country.name } });
  }
}

const NO_LOGIN = 'synthetic-account-no-login'; // not a valid scrypt record: these accounts can never sign in

/**
 * Replaces the synthetic demonstration dataset in one transaction. Only the generator's own
 * SYNTHETIC rows (and their cascades) are removed; REAL users, tracks and events are never touched.
 */
export async function replaceSyntheticDataset(database: PrismaClient, data: SyntheticDataset) {
  return database.$transaction(async tx => {
    // Only the generator's own rows: its accounts (and, by cascade, their events, likes and
    // sessions) and its tracks. Other SYNTHETIC rows, such as test fixtures, are left alone.
    await tx.user.deleteMany({ where: { dataOrigin: 'SYNTHETIC', email: { endsWith: '@synthetic.invalid' } } });
    await tx.track.deleteMany({ where: { dataOrigin: 'SYNTHETIC', slug: { startsWith: 'syn-track-' } } }); // cascades track genres
    // The generator's artist (any version) once it has no tracks left.
    await tx.artist.deleteMany({ where: { OR: [{ id: data.artist.id }, { name: data.artist.name }], tracks: { none: {} } } });
    await tx.syntheticDataset.deleteMany({});

    await seedRegions(tx);
    const regionIds = new Map((await tx.region.findMany({ select: { id: true, code: true } })).map(region => [region.code, region.id]));
    const genreIds = new Map<string, string>();
    for (const name of GENRES) genreIds.set(name, (await tx.genre.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } })).id);

    await tx.artist.upsert({ where: { id: data.artist.id }, create: data.artist, update: { name: data.artist.name } });
    await tx.track.createMany({ data: data.tracks.map(track => ({
      id: track.id, slug: track.slug, title: track.title, artistId: data.artist.id, durationMs: track.durationMs,
      audioKey: `synthetic/${track.slug}`, rightsStatement: 'Synthetic metadata for the analytics demonstration; no audio.', dataOrigin: 'SYNTHETIC' as const,
    })) });
    await tx.trackGenre.createMany({ data: data.tracks.map(track => ({ trackId: track.id, genreId: genreIds.get(track.genre)! })) });
    const consentAt = new Date(data.meta.referenceDate - data.meta.days * 86_400_000);
    await tx.user.createMany({ data: data.users.map(user => ({
      id: user.id, email: user.email, username: user.username, displayName: `Synthetic listener ${user.username.slice(4)}`,
      passwordHash: NO_LOGIN, regionId: regionIds.get(user.regionCode)!, locationConsentAt: consentAt, dataOrigin: 'SYNTHETIC' as const,
    })) });
    for (let i = 0; i < data.events.length; i += 5000) {
      await tx.listeningEvent.createMany({ data: data.events.slice(i, i + 5000).map(event => ({
        id: event.id, playbackSessionId: event.sessionId, userId: event.userId, trackId: event.trackId, occurredAt: new Date(event.at),
        listenedMs: event.listenedMs, completionRatio: event.completion, regionId: regionIds.get(event.regionCode)!,
        source: 'CATALOG' as const, dataOrigin: 'SYNTHETIC' as const, policyVersion: GENERATOR_VERSION,
      })) });
    }
    await tx.like.createMany({ data: data.likes.map(like => ({ userId: like.userId, trackId: like.trackId, createdAt: new Date(like.at) })) });
    const counts = { users: data.users.length, tracks: data.tracks.length, events: data.events.length, likes: data.likes.length };
    await tx.syntheticDataset.create({ data: {
      generatorVersion: data.meta.generatorVersion, seed: data.meta.seed, referenceDate: new Date(data.meta.referenceDate),
      parameters: { ...data.meta }, truth: data.truth, counts,
    } });
    return counts;
  }, { timeout: 180_000, maxWait: 10_000 });
}
