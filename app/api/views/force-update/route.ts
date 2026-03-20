import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { viewsSnapshotService } from "@/lib/payroll/snapshot";

/**
 * POST /api/views/force-update
 *
 * DIRECTOR only.  Bypasses the 48-hour cooldown and force-snapshots the
 * specified videos (or all active videos when videoIds is omitted / empty).
 *
 * Body: { videoIds?: string[] }
 * Response: { updated: number; skipped: number; errors: Array<{ videoId, error }> }
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole("DIRECTOR");

    const body = await req.json().catch(() => ({}));
    const videoIds: string[] | undefined = body.videoIds;

    let targetIds: string[];

    if (!videoIds || videoIds.length === 0) {
      // No specific videos requested → update all active videos (in active channels)
      const allVideos = await viewsSnapshotService.getVideosNeedingUpdate();

      // For force-update we also need videos that were updated recently but
      // are still active — pull all active videos directly.
      const { db } = await import("@/lib/db");
      const activeVideos = await db.video.findMany({
        where: {
          isActive: true,
          channel: { status: "ACTIVE" },
        },
        select: { id: true },
      });

      // Use the full active set (force ignores the 48 h window)
      targetIds = activeVideos.map((v) => v.id);
    } else {
      targetIds = videoIds;
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, errors: [] });
    }

    const result = await viewsSnapshotService.batchSnapshot(
      targetIds,
      true /* isForced */
    );

    return NextResponse.json({
      updated: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (err.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[POST /api/views/force-update]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
