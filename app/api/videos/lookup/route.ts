export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/videos/lookup?ids=id1,id2,...
 * Returns titles for YouTube Video IDs that exist in the database.
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
      .slice(0, 100);

    if (ids.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    type Row = { youtubeVideoId: string; title: string };
    const rows: Row[] = await db.$queryRaw`
      SELECT "youtubeVideoId", title
      FROM videos
      WHERE "youtubeVideoId" = ANY(${ids}::text[])`;

    return NextResponse.json({ videos: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
