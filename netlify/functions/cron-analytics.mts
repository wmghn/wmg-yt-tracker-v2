import type { Config } from "@netlify/functions";
import { db } from "../../lib/db";
import { syncAnalyticsSnapshots } from "../../lib/analytics/sync";
import type { DateRangeType } from "../../lib/youtube/analytics-api";

/**
 * Netlify Scheduled Function — analytics cron job.
 * Fires every hour, but reads CronConfig from DB to decide whether to actually run.
 *
 * Logic:
 *   1. Reads global CronConfig (enabled, frequency, runHour, dateRange)
 *   2. If disabled → skip
 *   3. If current UTC hour ≠ runHour → skip
 *   4. If lastRunAt is too recent for the configured frequency → skip
 *   5. Reads CronChannelConfig to determine which channels to sync (default: all enabled)
 *   6. Runs syncAnalyticsSnapshots for enabled channels
 *   7. Updates lastRunAt + lastResult
 */
async function saveLog(params: {
  status: "success" | "error" | "skipped";
  skipReason?: string;
  channelsSynced?: number;
  videosSynced?: number;
  snapshotsUpserted?: number;
  errors?: string[];
  durationMs?: number;
}) {
  await db.cronLog.create({
    data: {
      status: params.status,
      skipReason: params.skipReason ?? null,
      channelsSynced: params.channelsSynced ?? 0,
      videosSynced: params.videosSynced ?? 0,
      snapshotsUpserted: params.snapshotsUpserted ?? 0,
      errors: params.errors ?? [],
      durationMs: params.durationMs ?? null,
    },
  }).catch((e) => console.error("[cron-analytics] Failed to save log:", e));
}

export default async function handler() {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // ── Read global config ──────────────────────────────────────────────────────
  let config = await db.cronConfig.findUnique({ where: { id: "singleton" } });

  // Use defaults if config not yet created
  if (!config) {
    config = {
      id: "singleton",
      enabled: true,
      frequency: "daily",
      runHour: 2,
      dateRange: "month",
      lastRunAt: null,
      lastResult: null,
      updatedAt: now,
    };
  }

  if (!config.enabled) {
    console.log("[cron-analytics] Disabled globally — skip");
    await saveLog({ status: "skipped", skipReason: "Đã tắt toàn bộ" });
    return new Response("skipped:disabled", { status: 200 });
  }

  // ── Check frequency (min hours between runs) ────────────────────────────────
  const TEST_FREQUENCIES = new Set(["every5min", "every30min", "hourly"]);
  const isTestFrequency = TEST_FREQUENCIES.has(config.frequency);

  const minHoursMap: Record<string, number> = {
    // Test options
    every5min:  0.08,
    every30min: 0.45,
    hourly:     0.9,
    // Production options
    daily:      20,
    every2days: 44,
    weekly:     164,
  };
  const minHours = minHoursMap[config.frequency] ?? 20;

  // ── Check hour (only for non-test frequencies) ──────────────────────────────
  if (!isTestFrequency && utcHour !== config.runHour) {
    console.log(`[cron-analytics] UTC hour ${utcHour} ≠ configured ${config.runHour} — skip`);
    return new Response("skipped:wrong_hour", { status: 200 });
  }

  if (config.lastRunAt) {
    const hoursSince = (now.getTime() - new Date(config.lastRunAt).getTime()) / 3_600_000;
    if (hoursSince < minHours) {
      console.log(`[cron-analytics] Last run ${hoursSince.toFixed(1)}h ago < ${minHours}h — skip`);
      await saveLog({ status: "skipped", skipReason: `Chạy quá gần (${hoursSince.toFixed(1)}h < ${minHours}h)` });
      return new Response("skipped:too_soon", { status: 200 });
    }
  }

  // ── Determine which channels to sync ───────────────────────────────────────
  const [allChannels, channelConfigs] = await Promise.all([
    db.channel.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.cronChannelConfig.findMany({ select: { channelId: true, enabled: true } }),
  ]);

  const disabledSet = new Set(
    channelConfigs.filter((c) => !c.enabled).map((c) => c.channelId)
  );
  const channelIds = allChannels.map((c) => c.id).filter((id) => !disabledSet.has(id));

  if (channelIds.length === 0) {
    console.log("[cron-analytics] No enabled channels — skip");
    await saveLog({ status: "skipped", skipReason: "Không có kênh nào được bật" });
    return new Response("skipped:no_channels", { status: 200 });
  }

  // ── Acquire lock — prevent overlapping runs ────────────────────────────────
  // Check if another sync is currently in progress (SyncJob with status
  // "running" or "pending" created within the last 10 minutes). If so, skip.
  const recentRunning = await db.syncJob.findFirst({
    where: {
      status: { in: ["running", "pending"] },
      createdAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
  });

  if (recentRunning) {
    console.log(`[cron-analytics] Another sync is running (job ${recentRunning.id}, started ${recentRunning.createdAt.toISOString()}) — skip`);
    await saveLog({ status: "skipped", skipReason: `Sync khác đang chạy (job ${recentRunning.id})` });
    return new Response("skipped:locked", { status: 200 });
  }

  // Create a SyncJob to act as a lock
  const lockJob = await db.syncJob.create({
    data: {
      status: "running",
      channelIds,
      dateRange: config.dateRange,
      month: config.dateRange === "month" ? now.getUTCMonth() + 1 : null,
      year: config.dateRange === "month" ? now.getUTCFullYear() : null,
    },
  });

  // ── Resolve date range ──────────────────────────────────────────────────────
  const rangeType = (config.dateRange === "month" ? "month" : config.dateRange) as DateRangeType;
  const month = config.dateRange === "month" ? now.getUTCMonth() + 1 : undefined;
  const year  = config.dateRange === "month" ? now.getUTCFullYear() : undefined;

  // ── Run sync (channels are staggered internally with 5s delay) ─────────────
  console.log(`[cron-analytics] Starting sync: ${channelIds.length} channels, range=${config.dateRange}`);
  const startMs = Date.now();

  let result;
  try {
    result = await syncAnalyticsSnapshots(channelIds, rangeType, month, year);
  } catch (err) {
    result = {
      channelsSynced: 0,
      videosSynced: 0,
      snapshotsUpserted: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const durationMs = Date.now() - startMs;

  // ── Release lock + persist result + save log ──────────────────────────────
  await Promise.all([
    db.syncJob.update({
      where: { id: lockJob.id },
      data: {
        status: result.errors.length > 0 ? "error" : "done",
        result: result as unknown as Record<string, unknown>,
      },
    }),
    db.cronConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        enabled: config.enabled,
        frequency: config.frequency,
        runHour: config.runHour,
        dateRange: config.dateRange,
        lastRunAt: now,
        lastResult: result as unknown as Record<string, unknown>,
      },
      update: {
        lastRunAt: now,
        lastResult: result as unknown as Record<string, unknown>,
      },
    }),
    saveLog({
      status: result.errors.length > 0 ? "error" : "success",
      channelsSynced: result.channelsSynced,
      videosSynced: result.videosSynced,
      snapshotsUpserted: result.snapshotsUpserted,
      errors: result.errors,
      durationMs,
    }),
  ]);

  console.log("[cron-analytics] Done:", result);
  return new Response(JSON.stringify(result), { status: 200 });
}

// Fire every 5 minutes — DB config decides whether to actually run.
// Test frequencies (every5min, every30min, hourly) rely on this interval.
// Production frequencies (daily, every2days, weekly) use the runHour gate above.
export const config: Config = {
  schedule: "*/5 * * * *",
};
