-- Add startDate column to analytics_snapshots
-- This fixes a bug where "7 days" and "28 days" syncs on the same day
-- would overwrite each other (both had the same endDate = today).
-- The new unique key is (videoId, startDate, date) so each sync period
-- is stored separately.

-- Clear existing snapshots (they have mixed/wrong period data)
DELETE FROM analytics_snapshots;

-- Add startDate column (date of range start)
ALTER TABLE "analytics_snapshots" ADD COLUMN "startDate" date NOT NULL DEFAULT '2020-01-01';

-- Remove default (we set it only to allow adding NOT NULL to existing rows)
ALTER TABLE "analytics_snapshots" ALTER COLUMN "startDate" DROP DEFAULT;

-- Drop old unique index (Prisma creates @@unique as a unique index, not a constraint)
DROP INDEX IF EXISTS "analytics_snapshots_videoId_date_key";

-- Add new unique index: (videoId, startDate, date) where date = endDate
CREATE UNIQUE INDEX "analytics_snapshots_videoId_startDate_date_key"
  ON "analytics_snapshots" ("videoId", "startDate", date);

-- Remove default before finalizing
ALTER TABLE "analytics_snapshots" ALTER COLUMN "startDate" DROP DEFAULT;

-- Add index for startDate
CREATE INDEX "analytics_snapshots_startDate_idx" ON "analytics_snapshots"("startDate");
