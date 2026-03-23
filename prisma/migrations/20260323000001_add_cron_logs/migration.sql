-- CreateTable: cron_logs
CREATE TABLE "cron_logs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "channelsSynced" INTEGER NOT NULL DEFAULT 0,
    "videosSynced" INTEGER NOT NULL DEFAULT 0,
    "snapshotsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationMs" INTEGER,

    CONSTRAINT "cron_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_logs_runAt_idx" ON "cron_logs"("runAt");
