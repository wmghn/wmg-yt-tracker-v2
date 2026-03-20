-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" DECIMAL(15,2),
    "averageViewDuration" DECIMAL(10,2),
    "subscribersGained" INTEGER,
    "impressions" BIGINT,
    "impressionCTR" DECIMAL(10,4),
    "estimatedRevenue" DECIMAL(15,4),
    "cpm" DECIMAL(10,4),
    "rpm" DECIMAL(10,4),
    "likes" INTEGER,
    "comments" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_permissions" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricLabel" TEXT NOT NULL,
    "allowedRoles" "UserRole"[] DEFAULT ARRAY['DIRECTOR']::"UserRole"[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_videoId_idx" ON "analytics_snapshots"("videoId");

-- CreateIndex
CREATE INDEX "analytics_snapshots_date_idx" ON "analytics_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_videoId_date_key" ON "analytics_snapshots"("videoId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_permissions_metricKey_key" ON "metric_permissions"("metricKey");

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
