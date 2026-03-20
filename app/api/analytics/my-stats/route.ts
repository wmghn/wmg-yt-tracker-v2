import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get user's video assignments
    const assignments = await db.videoRoleAssignment.findMany({
      where: { userId: user.id, status: "APPROVED" },
      select: {
        videoId: true,
        role: true,
        video: {
          select: {
            id: true,
            title: true,
            publishedAt: true,
            viewsLog: {
              orderBy: { recordedAt: "desc" },
              take: 1,
              select: { viewsCount: true, recordedAt: true },
            },
          },
        },
      },
    });

    // Daily views trend for this user's videos
    const videoIds = assignments.map((a) => a.videoId);
    const viewLogs = await db.videoViewsLog.findMany({
      where: {
        videoId: { in: videoIds },
        recordedAt: { gte: thirtyDaysAgo },
      },
      select: { viewsCount: true, recordedAt: true },
      orderBy: { recordedAt: "asc" },
    });

    const byDate: Record<string, number> = {};
    for (const log of viewLogs) {
      const date = log.recordedAt.toISOString().slice(0, 10);
      byDate[date] = (byDate[date] ?? 0) + Number(log.viewsCount);
    }

    const now = new Date();
    const viewsTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      viewsTrend.push({ date: dateStr, views: byDate[dateStr] ?? 0 });
    }

    // Recent videos with latest views
    const recentVideos = assignments
      .map((a) => ({
        id: a.video.id,
        title: a.video.title,
        role: a.role,
        publishedAt: a.video.publishedAt,
        latestViews: Number(a.video.viewsLog[0]?.viewsCount ?? 0),
        lastUpdated: a.video.viewsLog[0]?.recordedAt ?? null,
      }))
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, 10);

    const totalViews30d = Object.values(byDate).reduce((sum, v) => sum + v, 0);
    const totalVideos = assignments.length;

    // Get latest payroll record
    const latestPayroll = await db.payrollRecord.findFirst({
      where: { userId: user.id },
      orderBy: { calculatedAt: "desc" },
      select: {
        totalSalary: true,
        totalViews: true,
        totalBonus: true,
        baseSalary: true,
        period: { select: { month: true, year: true } },
      },
    });

    return NextResponse.json({
      totalVideos,
      totalViews30d,
      viewsTrend,
      recentVideos,
      latestPayroll: latestPayroll
        ? {
            totalSalary: Number(latestPayroll.totalSalary),
            totalViews: Number(latestPayroll.totalViews),
            totalBonus: Number(latestPayroll.totalBonus),
            baseSalary: Number(latestPayroll.baseSalary),
            period: latestPayroll.period,
          }
        : null,
    });
  } catch (err) {
    console.error("[analytics/my-stats]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
