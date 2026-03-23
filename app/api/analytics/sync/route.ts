export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAnalyticsSnapshots } from "@/lib/analytics/sync";
import type { DateRangeType } from "@/lib/youtube/analytics-api";

/**
 * POST /api/analytics/sync
 *
 * Tạo một SyncJob, fire Netlify Background Function để chạy ngầm,
 * trả về { jobId } với HTTP 202 ngay lập tức.
 * Client poll GET /api/analytics/sync/status?jobId=xxx để theo dõi tiến trình.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    const userRole = (session.user as { role?: string }).role ?? "";
    const userId = session.user?.id as string;

    const body = await req.json().catch(() => ({}));
    const channelId: string | undefined = body.channelId || undefined;
    const rangeType: DateRangeType = body.dateRange ?? "28days";
    const month: number | undefined = body.month;
    const year: number | undefined = body.year;

    // Resolve channel IDs this user may sync
    let channelIds: string[] = [];

    if (channelId) {
      if (userRole === "MANAGER") {
        const ch = await db.channel.findFirst({
          where: { id: channelId, managerId: userId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!ch) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
      channelIds = [channelId];
    } else if (userRole === "MANAGER") {
      const managed = await db.channel.findMany({
        where: { managerId: userId, status: "ACTIVE" },
        select: { id: true },
      });
      channelIds = managed.map((c) => c.id);
    }

    // Tạo job record
    const job = await db.syncJob.create({
      data: {
        status: "pending",
        channelIds,
        dateRange: rangeType,
        month: month ?? null,
        year: year ?? null,
      },
    });

    const internalSecret = process.env.INTERNAL_SYNC_SECRET;
    const isNetlify = process.env.IS_NETLIFY === "true";

    if (isNetlify) {
      if (!internalSecret) {
        return NextResponse.json({ error: "INTERNAL_SYNC_SECRET chưa được cấu hình" }, { status: 500 });
      }

      // process.env.URL là biến chuẩn của Netlify (site URL chính)
      const baseUrl = process.env.URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:8888";
      const bgUrl = `${baseUrl}/.netlify/functions/sync-background`;

      console.log(`[sync] Triggering background function: ${bgUrl}`);

      // PHẢI await để đảm bảo Netlify nhận được request trước khi function context bị kill.
      // Background function trả 202 ngay lập tức → không bị block lâu.
      let triggerRes: Response;
      try {
        triggerRes = await fetch(bgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, channelIds, dateRange: rangeType, month, year, secret: internalSecret }),
        });
      } catch (err) {
        console.error("[sync] Không thể kết nối background function:", err);
        await db.syncJob.update({
          where: { id: job.id },
          data: { status: "error", result: { errors: ["Không thể khởi động background function"], channelsSynced: 0, videosSynced: 0, snapshotsUpserted: 0 } },
        }).catch(() => {});
        return NextResponse.json({ error: "Không thể khởi động sync" }, { status: 500 });
      }

      if (!triggerRes.ok) {
        console.error(`[sync] Background function trả về ${triggerRes.status}`);
        await db.syncJob.update({
          where: { id: job.id },
          data: { status: "error", result: { errors: [`Background function trả về ${triggerRes.status}`], channelsSynced: 0, videosSynced: 0, snapshotsUpserted: 0 } },
        }).catch(() => {});
        return NextResponse.json({ error: `Sync lỗi (${triggerRes.status})` }, { status: 500 });
      }
    } else {
      // Local dev: chạy sync trực tiếp trong background (không await response)
      void (async () => {
        try {
          await db.syncJob.update({ where: { id: job.id }, data: { status: "running" } });
          const result = await syncAnalyticsSnapshots(channelIds, rangeType, month, year);
          await db.syncJob.update({
            where: { id: job.id },
            data: {
              status: result.errors.length > 0 ? "error" : "done",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              result: result as any,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await db.syncJob.update({
            where: { id: job.id },
            data: { status: "error", result: { errors: [msg], channelsSynced: 0, videosSynced: 0, snapshotsUpserted: 0 } },
          }).catch(() => {});
        }
      })();
    }

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/analytics/sync]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
