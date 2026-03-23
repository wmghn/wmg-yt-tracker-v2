-- AddColumn: channel tracker and cron config relations on Channel
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "oauthTokenId" TEXT;

-- CreateTable: sync_jobs
CREATE TABLE IF NOT EXISTS "sync_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channelIds" TEXT[],
    "dateRange" TEXT NOT NULL,
    "month" INTEGER,
    "year" INTEGER,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_jobs_status_idx" ON "sync_jobs"("status");

-- CreateTable: cron_config
CREATE TABLE IF NOT EXISTS "cron_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "runHour" INTEGER NOT NULL DEFAULT 2,
    "dateRange" TEXT NOT NULL DEFAULT 'month',
    "lastRunAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cron_channel_configs
CREATE TABLE IF NOT EXISTS "cron_channel_configs" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_channel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cron_channel_configs_channelId_key" ON "cron_channel_configs"("channelId");

-- AddForeignKey
ALTER TABLE "cron_channel_configs" ADD CONSTRAINT "cron_channel_configs_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: channel_tracker_configs
CREATE TABLE IF NOT EXISTS "channel_tracker_configs" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_tracker_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "channel_tracker_configs_channelId_key" ON "channel_tracker_configs"("channelId");

-- AddForeignKey
ALTER TABLE "channel_tracker_configs" ADD CONSTRAINT "channel_tracker_configs_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumns to youtube_oauth_tokens (if not exists)
ALTER TABLE "youtube_oauth_tokens" ADD COLUMN IF NOT EXISTS "ytChannelId" TEXT;
ALTER TABLE "youtube_oauth_tokens" ADD COLUMN IF NOT EXISTS "ytChannelName" TEXT;
