-- AlterTable: track last cron run time per channel (for 1-hour stagger logic)
ALTER TABLE "cron_channel_configs" ADD COLUMN "lastRunAt" TIMESTAMP(3);
