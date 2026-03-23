export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;

    const { searchParams } = new URL(req.url);
    const rangeType = (searchParams.get("dateRange") ?? "28days") as DateRangeType;
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
    const year  = searchParams.get("year")  ? Number(searchParams.get("year"))  : undefined;
    const channelId = searchParams.get("channelId") ?? undefined;

    const dateRange = resolveDateRange(rangeType, month, year);
    const { startDate, endDate } = dateRange;

    // ── Channels the user is a member of ────────────────────────────────────
    type ChannelRow = { id: string; name: string };
    const channels: ChannelRow[] = await db.$queryRaw`
      SELECT c.id, c.name
      FROM channel_members cm
      JOIN channels c ON c.id = cm."channelId"
      WHERE cm."userId" = ${userId}
        AND c.status = 'ACTIVE'
      ORDER BY c.name ASC`;

    // ── Videos submitted by this staff ───────────────────────────────────────
    type VideoRow = {
      id: string;
      youtubeVideoId: string;
      title: string;
      channelId: string;
      channelName: string;
    };

    const videos: VideoRow[] = channelId
      ? await db.$queryRaw`
          SELECT v.id, v."youtubeVideoId", v.title, v."channelId", c.name AS "channelName"
          FROM videos v
          JOIN channels c ON c.id = v."channelId"
          WHERE v."submittedBy" = ${userId}
            AND v."isActive" = true
            AND c.status = 'ACTIVE'
            AND v."channelId" = ${channelId}
          ORDER BY v.title ASC`
      : await db.$queryRaw`
          SELECT v.id, v."youtubeVideoId", v.title, v."channelId", c.name AS "channelName"
          FROM videos v
          JOIN channels c ON c.id = v."channelId"
          WHERE v."submittedBy" = ${userId}
            AND v."isActive" = true
            AND c.status = 'ACTIVE'
          ORDER BY v.title ASC`;

    const videoIds = videos.map((v) => v.id);

    // ── Channel total views + video count + lastSyncedAt (all videos in channel) ──
    let channelTotalViews = 0;
    let channelVideoCount = 0;
    let channelLastSyncedAt: Date | null = null;
    if (channelId) {
      type ChanRow = { total: bigint; videoCount: bigint; lastFetchedAt: Date | null };
      const cvRows = await db.$queryRaw<ChanRow[]>`
        SELECT
          COALESCE(SUM(s.views), 0)::bigint AS total,
          COUNT(DISTINCT s."videoId")::bigint AS "videoCount",
          MAX(s."fetchedAt") AS "lastFetchedAt"
        FROM analytics_snapshots s
        JOIN videos v ON v.id = s."videoId"
        WHERE v."channelId" = ${channelId}
          AND s."startDate" = ${startDate}::date
          AND s.date = ${endDate}::date`;
      channelTotalViews = Number(cvRows[0]?.total ?? 0);
      channelVideoCount = Number(cvRows[0]?.videoCount ?? 0);
      channelLastSyncedAt = cvRows[0]?.lastFetchedAt ?? null;
    }

    if (videoIds.length === 0) {
      return NextResponse.json({
        dateRange,
        dataSource: "no_data",
        lastSyncedAt: channelLastSyncedAt,
        channels,
        channelTotalViews,
        channelVideoCount,
        summary: { views: 0, weightedViews: 0, videoCount: 0 },
        topVideos: [],
      });
    }

    // ── Snapshots ────────────────────────────────────────────────────────────
    type SnapshotRow = { videoId: string; views: bigint; fetchedAt: Date };
    const snapshots: SnapshotRow[] = await db.$queryRaw`
      SELECT "videoId", views::bigint AS views, "fetchedAt"
      FROM analytics_snapshots
      WHERE "videoId" = ANY(${videoIds}::text[])
        AND "startDate" = ${startDate}::date
        AND date = ${endDate}::date
        AND views > 0`;

    const lastSyncedAt = snapshots.length > 0
      ? snapshots.reduce((max, s) => s.fetchedAt > max ? s.fetchedAt : max, snapshots[0].fetchedAt)
      : null;

    const viewsMap = new Map<string, number>(snapshots.map((s) => [s.videoId, Number(s.views)]));

    // ── Role assignments for this user (APPROVED only) ───────────────────────
    type RoleRow = { videoId: string; role: string };
    const roleRows: RoleRow[] = videoIds.length > 0
      ? await db.$queryRaw`
          SELECT "videoId", role::text
          FROM video_role_assignments
          WHERE "userId" = ${userId}
            AND "videoId" = ANY(${videoIds}::text[])
            AND status = 'APPROVED'`
      : [];

    // A video may have multiple approved roles — collect all
    const roleMap = new Map<string, string[]>();
    for (const r of roleRows) {
      const existing = roleMap.get(r.videoId) ?? [];
      existing.push(r.role);
      roleMap.set(r.videoId, existing);
    }

    // ── Count of approved users per (videoId, role) — for weight division ────
    type RoleCountRow = { videoId: string; role: string; userCount: bigint };
    const roleCountRows: RoleCountRow[] = videoIds.length > 0
      ? await db.$queryRaw`
          SELECT "videoId", role::text, COUNT(DISTINCT "userId")::bigint AS "userCount"
          FROM video_role_assignments
          WHERE "videoId" = ANY(${videoIds}::text[])
            AND status = 'APPROVED'
          GROUP BY "videoId", role`
      : [];

    // roleCountMap: videoId → role → count
    const roleCountMap = new Map<string, Map<string, number>>();
    for (const r of roleCountRows) {
      if (!roleCountMap.has(r.videoId)) roleCountMap.set(r.videoId, new Map());
      roleCountMap.get(r.videoId)!.set(r.role, Number(r.userCount));
    }

    // ── Weight configs for each channel (latest effective per role) ──────────
    const channelIds = Array.from(new Set(videos.map((v) => v.channelId)));
    type WeightRow = { channelId: string; role: string; weightPercent: number };
    const weightRows: WeightRow[] = channelIds.length > 0
      ? await db.$queryRaw`
          SELECT DISTINCT ON ("channelId", role)
            "channelId", role::text, "weightPercent"::float AS "weightPercent"
          FROM channel_weight_configs
          WHERE "channelId" = ANY(${channelIds}::text[])
            AND "effectiveFrom" <= NOW()
          ORDER BY "channelId", role, "effectiveFrom" DESC`
      : [];

    // weightConfigMap: channelId → role → percent (0–100)
    const weightConfigMap = new Map<string, Map<string, number>>();
    for (const w of weightRows) {
      if (!weightConfigMap.has(w.channelId)) weightConfigMap.set(w.channelId, new Map());
      weightConfigMap.get(w.channelId)!.set(w.role, Number(w.weightPercent));
    }

    // ── Build topVideos ──────────────────────────────────────────────────────
    const topVideos = videos.map((v) => {
      const actualViews = viewsMap.get(v.id) ?? 0;
      const hasSnapshot = viewsMap.has(v.id);
      const roles = roleMap.get(v.id) ?? [];
      const channelWeights = weightConfigMap.get(v.channelId) ?? new Map();
      const roleCounts = roleCountMap.get(v.id) ?? new Map();

      // Build per-role weighted breakdown
      // effectiveWeight = roleWeight / numberOfPeopleWithSameRole
      const breakdown = roles.map((role) => {
        const pct = channelWeights.get(role) ?? null;
        const sameRoleCount = roleCounts.get(role) ?? 1;
        const effectivePct = pct !== null ? pct / sameRoleCount : null;
        const weighted = effectivePct !== null ? Math.round(actualViews * effectivePct) / 100 : null;
        return {
          role,
          label: role === "WRITER" ? "Content" : "Editor",
          weightPercent: effectivePct,
          weightedViews: weighted,
          formula: effectivePct !== null
            ? `${actualViews.toLocaleString("vi-VN")} × ${pct}%÷${sameRoleCount} = ${weighted?.toLocaleString("vi-VN") ?? "?"}`
            : null,
        };
      });

      // Total weighted views for this video (sum across all roles)
      const totalWeighted = breakdown.reduce((sum, b) => sum + (b.weightedViews ?? 0), 0);

      return {
        videoId: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        channelName: v.channelName,
        hasSnapshot,
        actualViews,
        weightedViews: roles.length > 0 ? totalWeighted : null,
        breakdown, // per-role detail
      };
    }).sort((a, b) => b.actualViews - a.actualViews);

    const totalActualViews = topVideos.reduce((s, v) => s + v.actualViews, 0);
    const totalWeightedViews = topVideos.reduce((s, v) => s + (v.weightedViews ?? 0), 0);

    return NextResponse.json({
      dateRange,
      dataSource: snapshots.length > 0 ? "analytics_snapshot" : "no_data",
      lastSyncedAt: channelLastSyncedAt ?? lastSyncedAt,
      channels,
      channelTotalViews,
      channelVideoCount,
      summary: {
        views: totalActualViews,
        weightedViews: totalWeightedViews,
        videoCount: topVideos.length,
      },
      topVideos,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
