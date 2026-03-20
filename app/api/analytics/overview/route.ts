import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireRole(["DIRECTOR"]);
    void session;

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalChannels, activeChannels, totalVideos, totalStaff, recentViews] =
      await Promise.all([
        db.channel.count(),
        db.channel.count({ where: { status: "ACTIVE" } }),
        db.video.count({ where: { isActive: true } }),
        db.user.count({ where: { isActive: true, role: "STAFF" } }),
        db.videoViewsLog.aggregate({
          _sum: { viewsCount: true },
          where: { recordedAt: { gte: thirtyDaysAgo } },
        }),
      ]);

    const recentRevenue = await db.videoViewsLog.aggregate({
      _sum: { revenueEstimate: true },
      where: { recordedAt: { gte: thirtyDaysAgo } },
    });

    return NextResponse.json({
      totalChannels,
      activeChannels,
      totalVideos,
      totalStaff,
      totalViews30d: Number(recentViews._sum.viewsCount ?? 0),
      totalRevenue30d: Number(recentRevenue._sum.revenueEstimate ?? 0),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[analytics/overview]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
