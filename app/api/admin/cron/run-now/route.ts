export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAnalyticsSnapshots } from "@/lib/analytics/sync";
import type { DateRangeType } from "@/lib/youtube/analytics-api";

/**
 * POST /api/admin/cron/run-now
 * Kích hoạt cron analytics ngay lập tức (dùng để test).
 * Bỏ qua kiểm tra runHour và frequency.
 */
export async function POST() {
  try {
    await requireRole("DIRECTOR");

    const now = new Date();

    const config = await db.cronConfig.findUnique({ where: { id: "singleton" } });
    const dateRange = (config?.dateRange ?? "month") as DateRangeType;
    // Use local timezone (not UTC) to match resolveDateRange behavior.
    // UTC would give wrong month at start of month in UTC+ timezones.
    const month = dateRange === "month" ? now.getMonth() + 1 : undefined;
    const year  = dateRange === "month" ? now.getFullYear() : undefined;

    // Lấy danh sách kênh được bật
    const [allChannels, channelConfigs] = await Promise.all([
      db.channel.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
      db.cronChannelConfig.findMany({ select: { channelId: true, enabled: true } }),
    ]);
    const disabledSet = new Set(
      channelConfigs.filter((c) => !c.enabled).map((c) => c.channelId)
    );
    const channelIds = allChannels.map((c) => c.id).filter((id) => !disabledSet.has(id));

    // ── Lock: check if another sync is already running ──────────────────────
    const recentRunning = await db.syncJob.findFirst({
      where: {
        status: { in: ["running", "pending"] },
        createdAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) },
      },
    });

    if (recentRunning) {
      return NextResponse.json(
        { error: `Sync đang chạy (job ${recentRunning.id}). Vui lòng đợi hoàn tất.` },
        { status: 409 }
      );
    }

    // Create lock job
    const lockJob = await db.syncJob.create({
      data: {
        status: "running",
        channelIds,
        dateRange,
        month: month ?? null,
        year: year ?? null,
      },
    });

    const startMs = Date.now();
    let result;
    try {
      result = await syncAnalyticsSnapshots(channelIds, dateRange, month, year);
    } catch (err) {
      result = {
        channelsSynced: 0,
        videosSynced: 0,
        snapshotsUpserted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
    const durationMs = Date.now() - startMs;

    await Promise.all([
      // Release lock
      db.syncJob.update({
        where: { id: lockJob.id },
        data: {
          status: result.errors.length > 0 ? "error" : "done",
          result: JSON.parse(JSON.stringify(result)),
        },
      }),
      db.cronConfig.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          enabled: config?.enabled ?? true,
          frequency: config?.frequency ?? "daily",
          runHour: config?.runHour ?? 2,
          dateRange: config?.dateRange ?? "month",
          lastRunAt: now,
          lastResult: JSON.parse(JSON.stringify(result)),
        },
        update: {
          lastRunAt: now,
          lastResult: JSON.parse(JSON.stringify(result)),
        },
      }),
      db.cronLog.create({
        data: {
          status: result.errors.length > 0 ? "error" : "success",
          channelsSynced: result.channelsSynced,
          videosSynced: result.videosSynced,
          snapshotsUpserted: result.snapshotsUpserted,
          errors: result.errors,
          durationMs,
        },
      }),
    ]);

    return NextResponse.json({ ...result, durationMs });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/admin/cron/run-now]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
