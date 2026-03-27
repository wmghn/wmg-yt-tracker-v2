-- Replace single-column index on video_views_log(videoId) with compound index
DROP INDEX IF EXISTS "video_views_log_videoId_idx";
CREATE INDEX "video_views_log_videoId_recordedAt_idx" ON "video_views_log"("videoId", "recordedAt" DESC);

-- Replace separate startDate and date indexes on analytics_snapshots with compound index
DROP INDEX IF EXISTS "analytics_snapshots_date_idx";
DROP INDEX IF EXISTS "analytics_snapshots_startDate_idx";
CREATE INDEX "analytics_snapshots_startDate_date_idx" ON "analytics_snapshots"("startDate", "date");

-- Replace single-column index on channel_weight_configs(channelId) with compound index
DROP INDEX IF EXISTS "channel_weight_configs_channelId_idx";
CREATE INDEX "channel_weight_configs_channelId_role_effectiveFrom_idx" ON "channel_weight_configs"("channelId", "role", "effectiveFrom" DESC);
