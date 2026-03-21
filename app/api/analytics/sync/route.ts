import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
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

    // Fire background function (không await — nó trả 202 ngay)
    const internalSecret = process.env.INTERNAL_SYNC_SECRET;
    if (!internalSecret) {
      return NextResponse.json({ error: "INTERNAL_SYNC_SECRET chưa được cấu hình" }, { status: 500 });
    }

    const baseUrl = process.env.NETLIFY_URL
      ?? process.env.NEXTAUTH_URL
      ?? "http://localhost:8888";

    fetch(`${baseUrl}/.netlify/functions/sync-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        channelIds,
        dateRange: rangeType,
        month,
        year,
        secret: internalSecret,
      }),
    }).catch(() => {
      // Cập nhật job thành error nếu không gọi được background fn
      db.syncJob.update({
        where: { id: job.id },
        data: { status: "error", result: { errors: ["Không thể khởi động background function"] } },
      }).catch(() => {});
    });

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
