-- Listening step: server-issued playback sessions and a policy version on events.

-- Partial progress lives here, never in ListeningEvent (ARCHITECTURE.md rule 3).
CREATE TABLE "PlaybackSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "source" "DiscoverySource" NOT NULL,
    "policyVersion" VARCHAR(20) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMPTZ(3),
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "lastPositionMs" INTEGER,
    "lastPlaying" BOOLEAN NOT NULL DEFAULT false,
    "accumulatedMs" INTEGER NOT NULL DEFAULT 0,
    "coveredIntervals" JSONB NOT NULL DEFAULT '[]',
    "qualifiedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlaybackSession_userId_startedAt_idx" ON "PlaybackSession"("userId", "startedAt");
CREATE INDEX "PlaybackSession_trackId_idx" ON "PlaybackSession"("trackId");
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_counters_nonnegative" CHECK ("accumulatedMs" >= 0 AND "lastSequence" >= 0 AND ("lastPositionMs" IS NULL OR "lastPositionMs" >= 0));
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_time_order" CHECK (("qualifiedAt" IS NULL OR "qualifiedAt" >= "startedAt") AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"));
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_intervals_array" CHECK (jsonb_typeof("coveredIntervals") = 'array');

-- Which rules produced each event (ARCHITECTURE.md rule 5). Any pre-existing rows
-- predate the policy and are marked as such.
ALTER TABLE "ListeningEvent" ADD COLUMN "policyVersion" VARCHAR(20) NOT NULL DEFAULT 'unversioned';
-- Supports the replay-cooldown lookup and per-user/track history.
CREATE INDEX "ListeningEvent_userId_trackId_occurredAt_idx" ON "ListeningEvent"("userId", "trackId", "occurredAt");
