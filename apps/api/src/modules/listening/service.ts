import type { PrismaClient } from '@prisma/client';
import { toCatalogTrack, type CatalogTrack } from '../catalog/contract.js';
import { trackSelect } from '../catalog/service.js';
import {
  HEARTBEAT_INTERVAL_MS, POLICY_VERSION, SESSION_LIFETIME_MS, applyHeartbeat, completionRatio, outsideCooldown, qualifyThresholdMs,
  type Heartbeat, type Interval, type SessionState, type Source,
} from './policy.js';

export class ListeningError extends Error {
  constructor(public code: 'NOT_FOUND' | 'TRACK_NOT_FOUND' | 'CLOSED' | 'RATE_LIMITED' | 'ORIGIN_MISMATCH', message: string) { super(message); }
}
export type SessionView = {
  id: string; policyVersion: string; heartbeatIntervalMs: number; qualifyAfterMs: number;
  accumulatedMs: number; completion: number; qualified: boolean; counted: boolean; ended: boolean;
};
export type HistoryEntry = { id: string; occurredAt: string; listenedMs: number; completion: number; track: CatalogTrack };
export type TrackStats = { origin: 'REAL'; window: 'all-time'; minimumListeners: number; listeners: number | null; listens: number | null; yourListens: number | null };
export type ListeningService = {
  start(userId: string, trackId: string, source: Source): Promise<SessionView>;
  heartbeat(userId: string, sessionId: string, beat: Heartbeat): Promise<SessionView>;
  end(userId: string, sessionId: string, beat: Heartbeat | null): Promise<SessionView>;
  history(userId: string, limit: number): Promise<{ listens: HistoryEntry[]; total: number }>;
  trackStats(trackId: string, userId: string | null): Promise<TrackStats>;
};

export const MAX_SESSIONS_PER_MINUTE = 30;
// Same threshold as regional suppression (ARCHITECTURE.md): audience numbers about
// other people are shown only once at least 10 distinct listeners exist.
export const MIN_PUBLIC_LISTENERS = 10;

// `now` is injectable so tests can move time (pauses, cooldowns) without sleeping.
export function listeningService(database: PrismaClient, now: () => number = Date.now): ListeningService {
  async function advance(userId: string, sessionId: string, beat: Heartbeat | null, finish: boolean): Promise<SessionView> {
    return database.$transaction(async tx => {
      // Row lock: concurrent or retried heartbeats for one session apply strictly one after another.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PlaybackSession" WHERE id = ${sessionId}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!locked.length) throw new ListeningError('NOT_FOUND', 'Playback session not found');
      const session = await tx.playbackSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { track: { select: { durationMs: true } }, user: { select: { regionId: true, dataOrigin: true } } },
      });
      const at = now();
      const duration = session.track.durationMs;
      let event = await tx.listeningEvent.findUnique({ where: { playbackSessionId: session.id }, select: { id: true } });
      const view = (state: { accumulatedMs: number; intervals: Interval[] }, qualifiedAt: Date | null, ended: boolean): SessionView => ({
        id: session.id, policyVersion: session.policyVersion, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, qualifyAfterMs: qualifyThresholdMs(duration),
        accumulatedMs: state.accumulatedMs, completion: completionRatio(state.intervals, duration), qualified: !!qualifiedAt, counted: !!event, ended,
      });
      const stored = { accumulatedMs: session.accumulatedMs, intervals: session.coveredIntervals as unknown as Interval[] };
      if (session.endedAt) {
        if (finish) return view(stored, session.qualifiedAt, true); // ending twice is harmless
        throw new ListeningError('CLOSED', 'This playback session has ended');
      }
      if (at - session.startedAt.getTime() > SESSION_LIFETIME_MS) {
        await tx.playbackSession.update({ where: { id: session.id }, data: { endedAt: new Date(at) } });
        if (finish) return view(stored, session.qualifiedAt, true);
        throw new ListeningError('CLOSED', 'This playback session has expired');
      }
      let state: SessionState = {
        lastAt: session.lastHeartbeatAt?.getTime() ?? null, lastPositionMs: session.lastPositionMs, lastPlaying: session.lastPlaying,
        lastSequence: session.lastSequence, accumulatedMs: session.accumulatedMs, intervals: stored.intervals,
      };
      if (beat) state = applyHeartbeat(state, beat, at, duration).state;
      const completion = completionRatio(state.intervals, duration);
      let qualifiedAt = session.qualifiedAt;
      if (!qualifiedAt && state.accumulatedMs >= qualifyThresholdMs(duration)) {
        qualifiedAt = new Date(at);
        // Serialize this user's qualifications so two sessions cannot both pass the cooldown check.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
        const last = await tx.listeningEvent.findFirst({
          where: { userId, trackId: session.trackId, dataOrigin: session.user.dataOrigin },
          orderBy: { occurredAt: 'desc' }, select: { occurredAt: true },
        });
        if (outsideCooldown(last?.occurredAt.getTime() ?? null, at)) {
          // Identity, time, origin and (consented) region come from the server, never the request.
          event = await tx.listeningEvent.create({
            data: {
              playbackSessionId: session.id, userId, trackId: session.trackId, occurredAt: qualifiedAt,
              listenedMs: state.accumulatedMs, completionRatio: completion, regionId: session.user.regionId,
              source: session.source, dataOrigin: session.user.dataOrigin, policyVersion: session.policyVersion,
            },
            select: { id: true },
          });
        }
      } else if (event) {
        // After counting, keep the event's listened time and coverage up to date for this session.
        await tx.listeningEvent.update({ where: { id: event.id }, data: { listenedMs: state.accumulatedMs, completionRatio: completion } });
      }
      await tx.playbackSession.update({
        where: { id: session.id },
        data: {
          lastHeartbeatAt: state.lastAt === null ? null : new Date(state.lastAt), lastSequence: state.lastSequence,
          lastPositionMs: state.lastPositionMs, lastPlaying: finish ? false : state.lastPlaying, accumulatedMs: state.accumulatedMs,
          coveredIntervals: state.intervals, qualifiedAt, endedAt: finish ? new Date(at) : null,
        },
      });
      return view(state, qualifiedAt, finish);
    });
  }

  return {
    async start(userId, trackId, source) {
      const at = now();
      const [user, track] = await Promise.all([
        database.user.findUniqueOrThrow({ where: { id: userId }, select: { dataOrigin: true } }),
        database.track.findFirst({ where: { id: trackId, dataOrigin: 'REAL' }, select: { durationMs: true, dataOrigin: true } }),
      ]);
      if (!track) throw new ListeningError('TRACK_NOT_FOUND', 'Track not found');
      // Events must share the origin of both the user and the track; real and synthetic data never mix.
      if (user.dataOrigin !== track.dataOrigin) throw new ListeningError('ORIGIN_MISMATCH', 'This account cannot record listens for this track');
      const recent = await database.playbackSession.count({ where: { userId, startedAt: { gte: new Date(at - 60_000) } } });
      if (recent >= MAX_SESSIONS_PER_MINUTE) throw new ListeningError('RATE_LIMITED', 'Too many tracks started in a minute');
      const session = await database.playbackSession.create({
        data: { userId, trackId, source, policyVersion: POLICY_VERSION, startedAt: new Date(at) }, select: { id: true },
      });
      return {
        id: session.id, policyVersion: POLICY_VERSION, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, qualifyAfterMs: qualifyThresholdMs(track.durationMs),
        accumulatedMs: 0, completion: 0, qualified: false, counted: false, ended: false,
      };
    },
    heartbeat: (userId, sessionId, beat) => advance(userId, sessionId, beat, false),
    end: (userId, sessionId, beat) => advance(userId, sessionId, beat, true),
    async history(userId, limit) {
      const where = { userId, track: { dataOrigin: 'REAL' as const } };
      const [rows, total] = await database.$transaction([
        database.listeningEvent.findMany({
          where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: limit,
          select: { id: true, occurredAt: true, listenedMs: true, completionRatio: true, track: { select: trackSelect } },
        }),
        database.listeningEvent.count({ where }),
      ]);
      return {
        listens: rows.map(row => ({ id: row.id, occurredAt: row.occurredAt.toISOString(), listenedMs: row.listenedMs, completion: row.completionRatio, track: toCatalogTrack(row.track) })),
        total,
      };
    },
    async trackStats(trackId, userId) {
      const track = await database.track.findFirst({ where: { id: trackId, dataOrigin: 'REAL' }, select: { id: true } });
      if (!track) throw new ListeningError('TRACK_NOT_FOUND', 'Track not found');
      const [totals] = await database.$queryRaw<{ listens: number; listeners: number }[]>`
        SELECT COUNT(*)::int AS listens, COUNT(DISTINCT "userId")::int AS listeners
        FROM "ListeningEvent" WHERE "trackId" = ${trackId}::uuid AND "dataOrigin" = 'REAL'`;
      const visible = (totals?.listeners ?? 0) >= MIN_PUBLIC_LISTENERS;
      const yourListens = userId ? await database.listeningEvent.count({ where: { userId, trackId, dataOrigin: 'REAL' } }) : null;
      return {
        origin: 'REAL', window: 'all-time', minimumListeners: MIN_PUBLIC_LISTENERS,
        listeners: visible ? totals!.listeners : null, listens: visible ? totals!.listens : null, yourListens,
      };
    },
  };
}
