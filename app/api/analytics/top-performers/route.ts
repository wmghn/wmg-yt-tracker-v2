export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    void session;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Top channels by views in last 30 days
    const channelViews = await db.videoViewsLog.groupBy({
      by: ["videoId"],
      _sum: { viewsCount: true },
      where: { recordedAt: { gte: thirtyDaysAgo } },
      orderBy: { _sum: { viewsCount: "desc" } },
      take: 50,
    });

    // Get video -> channel mapping
    const videoIds = channelViews.map((v) => v.videoId);
    const videos = await db.video.findMany({
      where: { id: { in: videoIds } },
      select: { id: true, channelId: true, channel: { select: { id: true, name: true } } },
    });
    const videoChannelMap = new Map(videos.map((v) => [v.id, v.channel]));

    // Aggregate by channel
    const channelMap = new Map<string, { name: string; views: number }>();
    for (const cv of channelViews) {
      const ch = videoChannelMap.get(cv.videoId);
      if (!ch) continue;
      const existing = channelMap.get(ch.id) ?? { name: ch.name, views: 0 };
      existing.views += Number(cv._sum.viewsCount ?? 0);
      channelMap.set(ch.id, existing);
    }

    const topChannels = Array.from(channelMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Top staff by video views
    const assignments = await db.videoRoleAssignment.findMany({
      where: { status: "APPROVED" },
      select: {
        userId: true,
        role: true,
        user: { select: { id: true, name: true, email: true } },
        video: {
          select: {
            viewsLog: {
              where: { recordedAt: { gte: thirtyDaysAgo } },
              select: { viewsCount: true },
            },
          },
        },
      },
    });

    const staffMap = new Map<string, { name: string; email: string; views: number }>();
    for (const a of assignments) {
      const views = a.video.viewsLog.reduce(
        (sum: number, l: { viewsCount: bigint }) => sum + Number(l.viewsCount),
        0
      );
      const existing = staffMap.get(a.userId) ?? {
        name: a.user.name ?? a.user.email ?? "",
        email: a.user.email ?? "",
        views: 0,
      };
      existing.views += views;
      staffMap.set(a.userId, existing);
    }

    const topStaff = Array.from(staffMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    return NextResponse.json({ topChannels, topStaff });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[analytics/top-performers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
