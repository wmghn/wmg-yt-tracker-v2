export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/videos/[id]
 * Update youtubeVideoId.
 * - DIRECTOR: can update any video.
 * - STAFF: can only update videos they submitted (submittedBy = userId).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;
    const role = session.user?.role as string;

    const body = await req.json();
    const youtubeVideoId: string | undefined = body.youtubeVideoId;

    if (!youtubeVideoId || !/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId)) {
      return NextResponse.json(
        { error: "YouTube Video ID không hợp lệ (phải đúng 11 ký tự)" },
        { status: 400 }
      );
    }

    type VideoRow = { id: string; submittedBy: string | null };
    const rows = await db.$queryRaw<VideoRow[]>`
      SELECT id, "submittedBy" FROM videos WHERE id = ${params.id} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Video không tồn tại" }, { status: 404 });
    }

    const video = rows[0];

    // Staff can only edit their own submitted videos
    if (role !== "DIRECTOR" && video.submittedBy !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.$executeRaw`
      UPDATE videos
      SET "youtubeVideoId" = ${youtubeVideoId},
          "updatedAt" = NOW()
      WHERE id = ${params.id}`;

    return NextResponse.json({ ok: true, youtubeVideoId });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
