import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    void session;

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get daily views aggregated for last 30 days
    const logs = await db.videoViewsLog.findMany({
      where: { recordedAt: { gte: thirtyDaysAgo } },
      select: { viewsCount: true, revenueEstimate: true, recordedAt: true },
      orderBy: { recordedAt: "asc" },
    });

    // Aggregate by date
    const byDate: Record<string, { views: number; revenue: number }> = {};
    for (const log of logs) {
      const date = log.recordedAt.toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = { views: 0, revenue: 0 };
      byDate[date].views += Number(log.viewsCount);
      byDate[date].revenue += Number(log.revenueEstimate ?? 0);
    }

    // Fill in missing days
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        views: byDate[dateStr]?.views ?? 0,
        revenue: byDate[dateStr]?.revenue ?? 0,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[analytics/views-trend]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
