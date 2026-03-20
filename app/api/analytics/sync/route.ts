import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAnalyticsSnapshots } from "@/lib/analytics/sync";
import type { DateRangeType } from "@/lib/youtube/analytics-api";

/**
 * POST /api/analytics/sync
 *
 * Fetches data from YouTube Analytics API and upserts into AnalyticsSnapshot.
 *
 * Body:
 *   channelId?: string   — omit to sync all accessible channels
 *   dateRange: "7days" | "28days" | "month" | "year"
 *   month?: number       — used when dateRange = "month"
 *   year?: number        — used when dateRange = "month" | "year"
 *
 * DIRECTOR: can sync any channel.
 * MANAGER: can only sync channels they manage.
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

    // Resolve which channel IDs this user may sync
    let channelIds: string[] = [];

    if (channelId) {
      // Validate access
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
      // Manager syncs all their channels
      const managed = await db.channel.findMany({
        where: { managerId: userId, status: "ACTIVE" },
        select: { id: true },
      });
      channelIds = managed.map((c) => c.id);
    }
    // DIRECTOR with no channelId → sync all (pass empty array → service handles it)

    const result = await syncAnalyticsSnapshots(channelIds, rangeType, month, year);

    return NextResponse.json(result);
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
