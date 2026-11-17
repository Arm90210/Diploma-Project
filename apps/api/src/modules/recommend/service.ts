import type { PrismaClient } from '@prisma/client';
import { toCatalogTrack, type CatalogTrack } from '../catalog/contract.js';
import { trackSelect } from '../catalog/service.js';
import { DEFAULT_NEIGHBOURS, MIN_PRIVATE_NEIGHBOURS, fitModel, recommend } from './model.js';

export const HISTORY_DAYS = 180;
export type RecommendationView = { track: CatalogTrack; reason: 'neighbours' | 'popular' | 'catalog' };
export type RecommendationService = { forUser(userId: string, limit: number): Promise<{ recommendations: RecommendationView[]; basis: 'neighbours' | 'popular' | 'catalog'; rules: { historyDays: number; neighbours: number; minimumNeighbours: number } }> };

// Live recommendations from REAL data only: counted listens of real accounts in the last 180 days.
// Known tracks (heard in that window or liked) are excluded. Personal results need at least
// MIN_PRIVATE_NEIGHBOURS similar listeners; otherwise platform popularity, then unheard catalog
// tracks, are used. Explanations never name or count other people.
export function recommendationService(database: PrismaClient, now: () => number = Date.now): RecommendationService {
  return {
    async forUser(userId, limit) {
      const since = new Date(now() - HISTORY_DAYS * 86_400_000);
      const [events, tracks, likes] = await Promise.all([
        database.listeningEvent.findMany({ where: { dataOrigin: 'REAL', occurredAt: { gte: since }, track: { dataOrigin: 'REAL' } }, select: { userId: true, trackId: true, occurredAt: true } }),
        database.track.findMany({ where: { dataOrigin: 'REAL' }, select: trackSelect, orderBy: [{ createdAt: 'asc' }, { slug: 'asc' }] }),
        database.like.findMany({ where: { userId }, select: { trackId: true } }),
      ]);
      const byId = new Map(tracks.map(track => [track.id, track]));
      const model = fitModel(
        events.map(event => ({ userId: event.userId, trackId: event.trackId, at: event.occurredAt.getTime(), regionId: null })),
        new Map(tracks.map(track => [track.id, track.genres.map(item => item.genre.name)])),
        byId.keys(),
      );
      const known = new Set([...(model.heard.get(userId) ?? []), ...likes.map(like => like.trackId)]);
      const ranked = recommend(model, userId, { k: DEFAULT_NEIGHBOURS, length: limit, exclude: known, minNeighbours: MIN_PRIVATE_NEIGHBOURS });
      const views: RecommendationView[] = ranked.filter(item => byId.has(item.trackId)).map(item => ({ track: toCatalogTrack(byId.get(item.trackId)!), reason: item.reason }));
      // With very little data, complete the list with catalog tracks the user has not heard yet.
      for (const track of tracks) {
        if (views.length >= limit) break;
        if (!known.has(track.id) && !views.some(view => view.track.id === track.id)) views.push({ track: toCatalogTrack(track), reason: 'catalog' });
      }
      return {
        recommendations: views, basis: views[0]?.reason ?? 'catalog',
        rules: { historyDays: HISTORY_DAYS, neighbours: DEFAULT_NEIGHBOURS, minimumNeighbours: MIN_PRIVATE_NEIGHBOURS },
      };
    },
  };
}
