import type { Prisma, PrismaClient } from '@prisma/client';
import { MAX_PLAYLISTS, MAX_PLAYLIST_TRACKS, isUuid, type ImportSummary, type LibraryImport, type LibraryPlaylist, type LibraryView } from './contract.js';

export class LibraryError extends Error {
  constructor(public code: 'NOT_FOUND' | 'TRACK_NOT_FOUND' | 'LIMIT', message: string) { super(message); }
}

export type LibraryService = {
  get(userId: string): Promise<LibraryView>;
  like(userId: string, trackId: string): Promise<void>;
  unlike(userId: string, trackId: string): Promise<void>;
  createPlaylist(userId: string, title: string): Promise<LibraryPlaylist>;
  deletePlaylist(userId: string, playlistId: string): Promise<void>;
  addTrack(userId: string, playlistId: string, trackId: string): Promise<void>;
  removeTrack(userId: string, playlistId: string, trackId: string): Promise<void>;
  importLibrary(userId: string, input: LibraryImport): Promise<{ library: LibraryView; imported: ImportSummary }>;
};

type Tx = Prisma.TransactionClient;
const realTrack = { dataOrigin: 'REAL' } as const;

// Every query is scoped by the session user's ID, which the router takes from the
// session — never from the request. Someone else's playlist is reported as
// NOT_FOUND, so its existence is not revealed.
export function libraryService(database: PrismaClient): LibraryService {
  async function requireTrack(client: Tx | PrismaClient, trackId: string) {
    const track = await client.track.findFirst({ where: { id: trackId, ...realTrack }, select: { id: true } });
    if (!track) throw new LibraryError('TRACK_NOT_FOUND', 'Track not found');
  }
  // Row lock serializes concurrent additions to one playlist, so appended positions never collide.
  async function lockOwnedPlaylist(tx: Tx, userId: string, playlistId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Playlist" WHERE id = ${playlistId}::uuid AND "ownerId" = ${userId}::uuid FOR NO KEY UPDATE`;
    if (!rows.length) throw new LibraryError('NOT_FOUND', 'Playlist not found');
  }
  async function nextPosition(tx: Tx, playlistId: string) {
    const result = await tx.playlistTrack.aggregate({ where: { playlistId }, _max: { position: true } });
    return (result._max.position ?? -1) + 1;
  }
  const service: LibraryService = {
    async get(userId) {
      const [likes, playlists] = await database.$transaction([
        database.like.findMany({ where: { userId, track: realTrack }, select: { trackId: true }, orderBy: [{ createdAt: 'asc' }, { trackId: 'asc' }] }),
        database.playlist.findMany({
          where: { ownerId: userId },
          select: { id: true, title: true, isPublic: true, tracks: { where: { track: realTrack }, select: { trackId: true }, orderBy: { position: 'asc' } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      return {
        likedTrackIds: likes.map(like => like.trackId),
        playlists: playlists.map(list => ({ id: list.id, title: list.title, isPublic: list.isPublic, trackIds: list.tracks.map(item => item.trackId) })),
      };
    },
    async like(userId, trackId) {
      await requireTrack(database, trackId);
      await database.like.createMany({ data: [{ userId, trackId }], skipDuplicates: true }); // idempotent
    },
    async unlike(userId, trackId) {
      await database.like.deleteMany({ where: { userId, trackId } }); // idempotent
    },
    async createPlaylist(userId, title) {
      return database.$transaction(async tx => {
        // Lock the owner row so two parallel requests cannot both pass the limit check.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
        if (await tx.playlist.count({ where: { ownerId: userId } }) >= MAX_PLAYLISTS) throw new LibraryError('LIMIT', `You can have up to ${MAX_PLAYLISTS} playlists`);
        const list = await tx.playlist.create({ data: { ownerId: userId, title }, select: { id: true, title: true, isPublic: true } });
        return { ...list, trackIds: [] };
      });
    },
    async deletePlaylist(userId, playlistId) {
      const result = await database.playlist.deleteMany({ where: { id: playlistId, ownerId: userId } });
      if (!result.count) throw new LibraryError('NOT_FOUND', 'Playlist not found');
    },
    async addTrack(userId, playlistId, trackId) {
      await database.$transaction(async tx => {
        await lockOwnedPlaylist(tx, userId, playlistId);
        await requireTrack(tx, trackId);
        if (await tx.playlistTrack.findUnique({ where: { playlistId_trackId: { playlistId, trackId } }, select: { trackId: true } })) return; // already there
        if (await tx.playlistTrack.count({ where: { playlistId } }) >= MAX_PLAYLIST_TRACKS) throw new LibraryError('LIMIT', `A playlist can hold up to ${MAX_PLAYLIST_TRACKS} tracks`);
        await tx.playlistTrack.create({ data: { playlistId, trackId, position: await nextPosition(tx, playlistId) } });
      });
    },
    async removeTrack(userId, playlistId, trackId) {
      await database.$transaction(async tx => {
        await lockOwnedPlaylist(tx, userId, playlistId);
        // Positions only define order; gaps after removal are intentional (no renumbering).
        await tx.playlistTrack.deleteMany({ where: { playlistId, trackId } });
      });
    },
    // One transaction: either the whole browser collection is saved or nothing is.
    // Re-running it is harmless: likes are de-duplicated and a playlist with the same
    // title is merged instead of duplicated (protects against retry after a lost response).
    async importLibrary(userId, input) {
      const imported = await database.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
        const references = [...input.liked, ...input.playlists.flatMap(list => list.trackIds)];
        const candidates = [...new Set(references.filter(isUuid))];
        const valid = new Set((await tx.track.findMany({ where: { id: { in: candidates }, ...realTrack }, select: { id: true } })).map(track => track.id));
        const summary: ImportSummary = { likesAdded: 0, playlistsCreated: 0, playlistsMerged: 0, tracksAdded: 0, skipped: references.filter(id => !valid.has(id)).length };
        const liked = [...new Set(input.liked.filter(id => valid.has(id)))];
        summary.likesAdded = (await tx.like.createMany({ data: liked.map(trackId => ({ userId, trackId })), skipDuplicates: true })).count;
        const existing = await tx.playlist.findMany({ where: { ownerId: userId }, select: { id: true, title: true } });
        for (const list of input.playlists) {
          let target = existing.find(item => item.title === list.title);
          if (target) summary.playlistsMerged++;
          else {
            if (existing.length >= MAX_PLAYLISTS) throw new LibraryError('LIMIT', `You can have up to ${MAX_PLAYLISTS} playlists`);
            target = await tx.playlist.create({ data: { ownerId: userId, title: list.title }, select: { id: true, title: true } });
            existing.push(target);
            summary.playlistsCreated++;
          }
          const present = new Set((await tx.playlistTrack.findMany({ where: { playlistId: target.id }, select: { trackId: true } })).map(item => item.trackId));
          let position = await nextPosition(tx, target.id);
          const additions: Prisma.PlaylistTrackCreateManyInput[] = [];
          for (const trackId of list.trackIds) {
            if (!valid.has(trackId) || present.has(trackId)) continue;
            if (present.size >= MAX_PLAYLIST_TRACKS) { summary.skipped++; continue; }
            present.add(trackId);
            additions.push({ playlistId: target.id, trackId, position: position++ });
          }
          if (additions.length) summary.tracksAdded += (await tx.playlistTrack.createMany({ data: additions })).count;
        }
        return summary;
      }, { timeout: 15000 });
      return { library: await service.get(userId), imported };
    },
  };
  return service;
}
