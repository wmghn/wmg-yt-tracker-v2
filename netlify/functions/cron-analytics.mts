import type { Config } from "@netlify/functions";
import { db } from "../../lib/db";
import { syncAnalyticsSnapshots } from "../../lib/analytics/sync";
import type { DateRangeType } from "../../lib/youtube/analytics-api";

/**
 * Netlify Scheduled Function — analytics cron job.
 * Fires every 5 minutes, but reads CronConfig from DB to decide whether to actually run.
 *
 * Logic:
 *   1. Reads global CronConfig (enabled, frequency, runHour, dateRange)
 *   2. If disabled → skip
 *   3. Test frequencies (every5min, every30min, hourly):
 *      - Global frequency gate (lastRunAt on CronConfig)
 *      - Runs all enabled channels together
 *   4. Production frequencies (daily, every2days, weekly):
 *      - Channels are staggered 1 hour apart
 *      - Channel at index i (sorted by ID) runs at (runHour + i) % 24 UTC
 *      - Per-channel frequency gate (lastRunAt on CronChannelConfig)
 *      - Each cron invocation runs only the channel(s) due at the current hour
 *   5. Runs syncAnalyticsSnapshots for eligible channels
 *   6. Updates per-channel lastRunAt + global lastRunAt + log
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

  // ── Frequency config ────────────────────────────────────────────────────────
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

  // ── Test frequencies: global frequency gate (all channels run together) ─────
  if (isTestFrequency && config.lastRunAt) {
    const hoursSince = (now.getTime() - new Date(config.lastRunAt).getTime()) / 3_600_000;
    if (hoursSince < minHours) {
      console.log(`[cron-analytics] Last run ${hoursSince.toFixed(1)}h ago < ${minHours}h — skip`);
      await saveLog({ status: "skipped", skipReason: `Chạy quá gần (${hoursSince.toFixed(1)}h < ${minHours}h)` });
      return new Response("skipped:too_soon", { status: 200 });
    }
  }

  // ── Load channels + per-channel config ─────────────────────────────────────
  const [allChannels, channelConfigs] = await Promise.all([
    db.channel.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.cronChannelConfig.findMany({ select: { channelId: true, enabled: true, lastRunAt: true } }),
  ]);

  const configMap = new Map(channelConfigs.map((c) => [c.channelId, c]));
  const disabledSet = new Set(
    channelConfigs.filter((c) => !c.enabled).map((c) => c.channelId)
  );

  // Sort by ID for stable, consistent channel ordering
  const enabledChannelIds = allChannels
    .map((c) => c.id)
    .filter((id) => !disabledSet.has(id))
    .sort();

  if (enabledChannelIds.length === 0) {
    console.log("[cron-analytics] No enabled channels — skip");
    await saveLog({ status: "skipped", skipReason: "Không có kênh nào được bật" });
    return new Response("skipped:no_channels", { status: 200 });
  }

  // ── Determine which channels are eligible this invocation ──────────────────
  let channelIds: string[];

  if (isTestFrequency) {
    // Test mode: run all enabled channels (global frequency gate already passed above)
    channelIds = enabledChannelIds;
  } else {
    // Production mode: stagger channels 1 hour apart.
    // Channel at index i (0-based, sorted by ID) targets UTC hour = (runHour + i) % 24.
    // Each channel also has its own per-channel frequency gate.
    channelIds = [];
    for (let i = 0; i < enabledChannelIds.length; i++) {
      const channelId = enabledChannelIds[i];
      const targetHour = (config.runHour + i) % 24;

      if (utcHour !== targetHour) continue;

      const chConfig = configMap.get(channelId);
      const chLastRunAt = chConfig?.lastRunAt ?? null;
      if (chLastRunAt) {
        const hoursSince = (now.getTime() - new Date(chLastRunAt).getTime()) / 3_600_000;
        if (hoursSince < minHours) {
          console.log(`[cron-analytics] Channel ${channelId} ran ${hoursSince.toFixed(1)}h ago < ${minHours}h — skip`);
          continue;
        }
      }

      channelIds.push(channelId);
    }

    if (channelIds.length === 0) {
      console.log(`[cron-analytics] No channels due at UTC hour ${utcHour} — skip`);
      return new Response("skipped:wrong_hour", { status: 200 });
    }
  }

  // ── Acquire lock — prevent overlapping runs ────────────────────────────────
  const recentRunning = await db.syncJob.findFirst({
    where: {
      status: { in: ["running", "pending"] },
      createdAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
  });

  if (recentRunning) {
    console.log(`[cron-analytics] Another sync is running (job ${recentRunning.id}) — skip`);
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

  // ── Run sync ────────────────────────────────────────────────────────────────
  console.log(`[cron-analytics] Starting sync: ${channelIds.length} channel(s), range=${config.dateRange}, UTC hour=${utcHour}`);
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

  // ── Update per-channel lastRunAt (production mode only) ────────────────────
  if (!isTestFrequency) {
    await Promise.all(
      channelIds.map((channelId) =>
        db.cronChannelConfig.upsert({
          where: { channelId },
          create: { channelId, enabled: true, lastRunAt: now },
          update: { lastRunAt: now },
        })
      )
    );
  }

  // ── Release lock + persist global result + save log ──────────────────────
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
// Production frequencies (daily, every2days, weekly) use the per-channel runHour gate.
export const config: Config = {
  schedule: "*/5 * * * *",
};
