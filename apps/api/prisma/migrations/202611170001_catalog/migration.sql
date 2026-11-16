-- Catalog step: stable public slugs and platform-curated tracks.

-- Curated/seeded catalog tracks (the original demo studies) have no uploading
-- account. User uploads will still set uploaderId; deleting an uploader remains
-- restricted by the existing foreign key.
ALTER TABLE "Track" ALTER COLUMN "uploaderId" DROP NOT NULL;

-- A stable, human-readable identifier used for seeding, track URLs and for
-- migrating browser-stored references such as "study-0". Existing rows (none
-- are expected) receive their UUID text, which satisfies the format check.
ALTER TABLE "Track" ADD COLUMN "slug" VARCHAR(80);
UPDATE "Track" SET "slug" = "id"::text WHERE "slug" IS NULL;
ALTER TABLE "Track" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Track_slug_key" ON "Track"("slug");
ALTER TABLE "Track" ADD CONSTRAINT "Track_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
