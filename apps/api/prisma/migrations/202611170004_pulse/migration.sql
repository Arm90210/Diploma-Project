-- Music Pulse step: provenance of the synthetic demonstration dataset
-- (ARCHITECTURE.md "Privacy and reproducibility": record seed, generator version,
-- reference date and planted truth). One row per generated dataset.
CREATE TABLE "SyntheticDataset" (
    "id" UUID NOT NULL,
    "generatorVersion" VARCHAR(40) NOT NULL,
    "seed" INTEGER NOT NULL,
    "referenceDate" TIMESTAMPTZ(3) NOT NULL,
    "parameters" JSONB NOT NULL,
    "truth" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyntheticDataset_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SyntheticDataset" ADD CONSTRAINT "SyntheticDataset_reference_midnight" CHECK (date_trunc('day', "referenceDate" AT TIME ZONE 'UTC') = "referenceDate" AT TIME ZONE 'UTC');

-- (Likes are read by track and time window; the index "Like_trackId_createdAt_idx" already exists.)
