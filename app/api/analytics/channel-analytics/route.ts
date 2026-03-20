export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";

export async function GET(req: Request) {
  try {
    const session = await requireRole(["MANAGER", "DIRECTOR"]);
    const userRole = (session.user as { role?: string }).role ?? "";
    const userId = session.user?.id as string;

    const { searchParams } = new URL(req.url);
    const rangeType = (searchParams.get("dateRange") ?? "28days") as DateRangeType;
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
    const year  = searchParams.get("year")  ? Number(searchParams.get("year"))  : undefined;
    const channelId = searchParams.get("channelId") ?? undefined;

    const dateRange = resolveDateRange(rangeType, month, year);
    const { startDate, endDate } = dateRange;

    // ── Channels accessible by this user (raw SQL) ───────────────────────────
    type ChannelRow = { id: string; name: string };
    const allChannels: ChannelRow[] = userRole === "MANAGER"
      ? await db.$queryRaw`
          SELECT id, name FROM channels
          WHERE "managerId" = ${userId} AND status = 'ACTIVE'
          ORDER BY name ASC`
      : await db.$queryRaw`
          SELECT id, name FROM channels
          WHERE status = 'ACTIVE'
          ORDER BY name ASC`;

    // ── Per-channel query when channelId is given ────────────────────────────
    if (channelId) {
      if (!allChannels.some((c) => c.id === channelId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // All videos in the channel
      type VideoRow = {
        id: string; youtubeVideoId: string; title: string;
        thumbnailUrl: string | null; publishedAt: Date | null;
      };
      const videos: VideoRow[] = await db.$queryRaw`
        SELECT id, "youtubeVideoId", title, "thumbnailUrl", "publishedAt"
        FROM videos
        WHERE "channelId" = ${channelId} AND "isActive" = true
        ORDER BY "publishedAt" DESC NULLS LAST`;

      const videoIds = videos.map((v) => v.id);

      // Views per video for exactly this sync period (startDate + endDate exact match)
      type SnapshotRow = { videoId: string; views: bigint; fetchedAt: Date };
      const snapshots: SnapshotRow[] = videoIds.length > 0
        ? await db.$queryRaw`
            SELECT "videoId", views::bigint AS views, "fetchedAt"
            FROM analytics_snapshots
            WHERE "videoId" = ANY(${videoIds}::text[])
              AND "startDate" = ${startDate}::date
              AND date = ${endDate}::date
              AND views > 0`
        : [];

      // Staff assignments per video
      type AssignRow = { videoId: string; userName: string; role: string };
      const assigns: AssignRow[] = videoIds.length > 0
        ? await db.$queryRaw`
            SELECT vra."videoId", u.name AS "userName", vra.role
            FROM video_role_assignments vra
            JOIN users u ON u.id = vra."userId"
            WHERE vra."videoId" = ANY(${videoIds}::text[])
              AND vra.status = 'APPROVED'`
        : [];

      const lastSyncedAt = snapshots.length > 0
        ? snapshots.reduce((max, s) => s.fetchedAt > max ? s.fetchedAt : max, snapshots[0].fetchedAt)
        : null;

      const viewsMap = new Map<string, number>(
        snapshots.map((s) => [s.videoId, Number(s.views)])
      );
      const staffMap = new Map<string, { name: string; role: string }[]>();
      for (const a of assigns) {
        const arr = staffMap.get(a.videoId) ?? [];
        arr.push({ name: a.userName, role: a.role });
        staffMap.set(a.videoId, arr);
      }

      // Only include videos that had views in the period
      const topVideos = videos
        .filter((v) => viewsMap.has(v.id))
        .map((v) => ({
          videoId: v.id,
          youtubeVideoId: v.youtubeVideoId,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          publishedAt: v.publishedAt,
          staff: staffMap.get(v.id) ?? [],
          metrics: { views: viewsMap.get(v.id) ?? 0 },
        }))
        .sort((a, b) => b.metrics.views - a.metrics.views);

      const totalViews = topVideos.reduce((s, v) => s + v.metrics.views, 0);

      // Staff breakdown
      const staffViewsMap = new Map<string, { name: string; views: number; videoCount: number }>();
      for (const v of topVideos) {
        for (const s of v.staff) {
          const e = staffViewsMap.get(s.name) ?? { name: s.name, views: 0, videoCount: 0 };
          e.views += v.metrics.views;
          e.videoCount += 1;
          staffViewsMap.set(s.name, e);
        }
      }

      return NextResponse.json({
        dateRange,
        dataSource: snapshots.length > 0 ? "analytics_snapshot" : "no_data",
        mode: "channel",
        lastSyncedAt: lastSyncedAt ?? null,
        summary: { views: totalViews, videoCount: topVideos.length, staffCount: staffViewsMap.size },
        topVideos,
        staffBreakdown: Array.from(staffViewsMap.values()).sort((a, b) => b.views - a.views),
        channels: allChannels,
      });
    }

    // ── Overview: all accessible channels ────────────────────────────────────
    const channelIds = allChannels.map((c) => c.id);

    if (channelIds.length === 0) {
      return NextResponse.json({
        dateRange, dataSource: "no_data", mode: "overview",
        summary: { views: 0, videoCount: 0, staffCount: 0 },
        topVideos: [], staffBreakdown: [], channels: [],
      });
    }

    // Videos with views for exactly this sync period (startDate + endDate exact match)
    type OverviewRow = {
      videoId: string; youtubeVideoId: string; title: string;
      thumbnailUrl: string | null; channelName: string; views: bigint; fetchedAt: Date;
    };
    const overviewRows: OverviewRow[] = await db.$queryRaw`
      SELECT
        v.id AS "videoId",
        v."youtubeVideoId",
        v.title,
        v."thumbnailUrl",
        c.name AS "channelName",
        s.views::bigint AS views,
        s."fetchedAt"
      FROM analytics_snapshots s
      JOIN videos v ON v.id = s."videoId"
      JOIN channels c ON c.id = v."channelId"
      WHERE c.id = ANY(${channelIds}::text[])
        AND s."startDate" = ${startDate}::date
        AND s.date = ${endDate}::date
        AND v."isActive" = true
        AND s.views > 0
      ORDER BY s.views DESC
      LIMIT 100`;

    const videoIds = overviewRows.map((r) => r.videoId);

    type AssignRow2 = { videoId: string; userName: string; userId: string; role: string };
    const assigns: AssignRow2[] = videoIds.length > 0
      ? await db.$queryRaw`
          SELECT vra."videoId", u.name AS "userName", vra."userId", vra.role
          FROM video_role_assignments vra
          JOIN users u ON u.id = vra."userId"
          WHERE vra."videoId" = ANY(${videoIds}::text[])
            AND vra.status = 'APPROVED'`
      : [];

    const staffMap = new Map<string, { name: string; role: string }[]>();
    for (const a of assigns) {
      const arr = staffMap.get(a.videoId) ?? [];
      arr.push({ name: a.userName, role: a.role });
      staffMap.set(a.videoId, arr);
    }

    const topVideos = overviewRows.map((r) => ({
      videoId: r.videoId,
      youtubeVideoId: r.youtubeVideoId,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      channelName: r.channelName,
      staff: staffMap.get(r.videoId) ?? [],
      metrics: { views: Number(r.views) },
    }));

    const totalViews = topVideos.reduce((s, v) => s + v.metrics.views, 0);

    // Staff breakdown
    const staffViewsMap = new Map<string, { userId: string; name: string; views: number; videoCount: number }>();
    for (const a of assigns) {
      const views = Number(overviewRows.find((r) => r.videoId === a.videoId)?.views ?? 0);
      const e = staffViewsMap.get(a.userId) ?? { userId: a.userId, name: a.userName, views: 0, videoCount: 0 };
      e.views += views;
      e.videoCount += 1;
      staffViewsMap.set(a.userId, e);
    }

    const overviewLastSyncedAt = overviewRows.length > 0
      ? overviewRows.reduce((max, r) => r.fetchedAt > max ? r.fetchedAt : max, overviewRows[0].fetchedAt)
      : null;

    return NextResponse.json({
      dateRange,
      dataSource: overviewRows.length > 0 ? "analytics_snapshot" : "no_data",
      mode: "overview",
      lastSyncedAt: overviewLastSyncedAt,
      summary: { views: totalViews, videoCount: topVideos.length, staffCount: staffViewsMap.size },
      topVideos,
      staffBreakdown: Array.from(staffViewsMap.values()).sort((a, b) => b.views - a.views),
      channels: allChannels,
    });

  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[channel-analytics]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
