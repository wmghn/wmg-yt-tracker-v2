import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";

/**
 * GET /api/videos/views-lookup?ids=id1,id2,...&dateRange=28days&month=3&year=2026
 * Returns title + view count for each YouTube Video ID.
 * - Non-lifetime ranges → analytics_snapshots (period views)
 * - lifetime / no snapshot match → video_views_log (latest cumulative)
 */
export async function GET(req: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z0-9_-]{11}$/.test(s))
      .slice(0, 200);

    if (ids.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    const rangeType = (searchParams.get("dateRange") ?? "lifetime") as DateRangeType;
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
    const year  = searchParams.get("year")  ? Number(searchParams.get("year"))  : undefined;
    const dateRange = resolveDateRange(rangeType, month, year);
    const { startDate, endDate } = dateRange;

    const useSnapshot = rangeType !== "lifetime";

    type Row = { youtubeVideoId: string; title: string; viewsCount: bigint };
    let rows: Row[];

    if (useSnapshot) {
      rows = await db.$queryRaw<Row[]>`
        SELECT
          v."youtubeVideoId",
          v.title,
          COALESCE(s.views, 0)::bigint AS "viewsCount"
        FROM videos v
        LEFT JOIN analytics_snapshots s
          ON s."videoId" = v.id
          AND s."startDate" = ${startDate}::date
          AND s.date = ${endDate}::date
        WHERE v."youtubeVideoId" = ANY(${ids}::text[])`;
    } else {
      rows = await db.$queryRaw<Row[]>`
        SELECT
          v."youtubeVideoId",
          v.title,
          COALESCE(
            (SELECT vvl."viewsCount"
             FROM video_views_log vvl
             WHERE vvl."videoId" = v.id
             ORDER BY vvl."recordedAt" DESC
             LIMIT 1
            ), 0
          )::bigint AS "viewsCount"
        FROM videos v
        WHERE v."youtubeVideoId" = ANY(${ids}::text[])`;
    }

    return NextResponse.json({
      dateRange,
      videos: rows.map((r) => ({
        youtubeVideoId: r.youtubeVideoId,
        title: r.title,
        viewsCount: Number(r.viewsCount),
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
