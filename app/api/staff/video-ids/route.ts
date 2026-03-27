export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { youtubeDataAPI } from "@/lib/youtube/data-api";

/**
 * GET    /api/staff/video-ids?channelId=...
 * Returns { writerIds: string[], editorIds: string[] } for this staff+channel.
 *
 * POST /api/staff/video-ids
 * Sync a staff member's YouTube Video IDs for a channel + role.
 * - New IDs → create video records (with YouTube metadata if available)
 * - Removed IDs from that role → deactivate role assignment (and video if no other assignments)
 *
 * DELETE /api/staff/video-ids?channelId=...&role=WRITER|EDITOR
 * Clear all video role assignments for this staff+channel+role.
 */

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId bắt buộc" }, { status: 400 });
    }

    type Row = { youtubeVideoId: string; role: string };
    const rows = await db.$queryRaw<Row[]>`
      SELECT v."youtubeVideoId", vra.role::text
      FROM video_role_assignments vra
      JOIN videos v ON v.id = vra."videoId"
      WHERE vra."userId" = ${userId}
        AND v."channelId" = ${channelId}
        AND v."isActive" = true
        AND vra.status IN ('PENDING', 'APPROVED')
      ORDER BY v.title ASC`;

    const writerIds = rows.filter((r) => r.role === "WRITER").map((r) => r.youtubeVideoId);
    const editorIds = rows.filter((r) => r.role === "EDITOR").map((r) => r.youtubeVideoId);

    return NextResponse.json({ writerIds, editorIds });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;

    const body = await req.json();
    const channelId: string = body.channelId;
    const newIds: string[] = body.youtubeVideoIds ?? [];
    const role: string = body.role ?? "WRITER";
    // Co-workers: other channel members who also worked on these videos with the same role
    const coWorkerIds: string[] = body.coWorkerIds ?? [];

    if (!["WRITER", "EDITOR"].includes(role)) {
      return NextResponse.json({ error: "Role không hợp lệ" }, { status: 400 });
    }

    if (!channelId) {
      return NextResponse.json({ error: "channelId bắt buộc" }, { status: 400 });
    }

    // Validate: user must be a channel member
    type MemberRow = { id: string };
    const member = await db.$queryRaw<MemberRow[]>`
      SELECT id FROM channel_members
      WHERE "channelId" = ${channelId} AND "userId" = ${userId}
      LIMIT 1`;
    if (member.length === 0) {
      return NextResponse.json({ error: "Bạn không phải thành viên kênh này" }, { status: 403 });
    }

    // Validate all IDs
    const validIds = Array.from(new Set(
      newIds.map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{11}$/.test(s))
    ));

    // Current videos submitted by this user for this channel that have the current role assignment
    type VideoRow = { id: string; youtubeVideoId: string };
    const existingWithRole = await db.$queryRaw<VideoRow[]>`
      SELECT v.id, v."youtubeVideoId"
      FROM videos v
      JOIN video_role_assignments vra ON vra."videoId" = v.id
      WHERE v."submittedBy" = ${userId}
        AND v."channelId" = ${channelId}
        AND vra."userId" = ${userId}
        AND vra.role = ${role}::"VideoRole"`;

    // All videos for this user+channel (any role or no role), for create/reactivate check
    const allExisting = await db.$queryRaw<VideoRow[]>`
      SELECT id, "youtubeVideoId"
      FROM videos
      WHERE "submittedBy" = ${userId}
        AND "channelId" = ${channelId}`;

    const allExistingMap = new Map(allExisting.map((v) => [v.youtubeVideoId, v.id]));
    const allExistingIds = new Set(allExisting.map((v) => v.youtubeVideoId));
    const newSet = new Set(validIds);

    // Remove role assignment for videos no longer in this role's list
    const toRemoveRole = existingWithRole
      .filter((v) => !newSet.has(v.youtubeVideoId))
      .map((v) => v.id);

    let deactivated = 0;
    if (toRemoveRole.length > 0) {
      await db.$executeRaw`
        DELETE FROM video_role_assignments
        WHERE "userId" = ${userId}
          AND role = ${role}::"VideoRole"
          AND "videoId" = ANY(${toRemoveRole}::text[])`;

      // Deactivate videos that now have no remaining role assignments from this user
      await db.$executeRaw`
        UPDATE videos SET "isActive" = false, "updatedAt" = NOW()
        WHERE id = ANY(${toRemoveRole}::text[])
          AND "submittedBy" = ${userId}
          AND id NOT IN (
            SELECT "videoId" FROM video_role_assignments WHERE "userId" = ${userId}
          )`;
      deactivated = toRemoveRole.length;
    }

    // Re-activate any that were previously deactivated and are back in the list
    type InactiveRow = { id: string; youtubeVideoId: string };
    const reactivate = await db.$queryRaw<InactiveRow[]>`
      SELECT id, "youtubeVideoId"
      FROM videos
      WHERE "youtubeVideoId" = ANY(${validIds}::text[])
        AND "channelId" = ${channelId}
        AND "submittedBy" = ${userId}
        AND "isActive" = false`;

    if (reactivate.length > 0) {
      const reactivateIds = reactivate.map((v) => v.id);
      await db.$executeRaw`
        UPDATE videos SET "isActive" = true, "updatedAt" = NOW()
        WHERE id = ANY(${reactivateIds}::text[])`;
      reactivate.forEach((v) => allExistingIds.add(v.youtubeVideoId));
    }

    // IDs to create (new, not yet in DB for this user+channel at all)
    const toCreate = validIds.filter((id) => !allExistingMap.has(id) && !allExistingIds.has(id));

    // Fetch YouTube metadata for new videos
    let ytMap = new Map<string, { title: string; thumbnailUrl: string | null; publishedAt: string | null; viewCount: number }>();
    if (toCreate.length > 0 && process.env.YOUTUBE_API_KEY) {
      try {
        const ytDetails = await youtubeDataAPI.getVideoDetails(toCreate);
        ytMap = new Map(ytDetails.map((d) => [d.youtubeVideoId, d]));
      } catch { /* non-fatal */ }
    }

    let created = 0;
    let skipped = 0;

    for (const ytId of toCreate) {
      // Check if this video ID already exists (submitted by someone else)
      type ExRow = { id: string };
      const alreadyExists = await db.$queryRaw<ExRow[]>`
        SELECT id FROM videos WHERE "youtubeVideoId" = ${ytId} LIMIT 1`;

      if (alreadyExists.length > 0) {
        skipped++;
        continue;
      }

      const yt = ytMap.get(ytId);
      await db.$executeRaw`
        INSERT INTO videos (id, "youtubeVideoId", "channelId", title, "thumbnailUrl", "publishedAt", "submittedBy", "isActive", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${ytId},
          ${channelId},
          ${yt?.title ?? ytId},
          ${yt?.thumbnailUrl ?? null},
          ${yt?.publishedAt ? new Date(yt.publishedAt) : null},
          ${userId},
          true,
          NOW(), NOW()
        )`;
      created++;
    }

    // Batch fetch all video internal IDs for valid YouTube IDs (replaces N+1 loop)
    type VRow = { id: string; youtubeVideoId: string };
    const videoRows = await db.$queryRaw<VRow[]>`
      SELECT id, "youtubeVideoId" FROM videos
      WHERE "youtubeVideoId" = ANY(${validIds}::text[])
        AND "channelId" = ${channelId}`;
    const allVideoIds = videoRows.map((r) => r.id);

    // Batch upsert role assignments for current user
    if (allVideoIds.length > 0) {
      await db.$executeRaw`
        INSERT INTO video_role_assignments (id, "videoId", "userId", role, status, "createdAt")
        SELECT gen_random_uuid(), vid, ${userId}, ${role}::"VideoRole", 'PENDING', NOW()
        FROM unnest(${allVideoIds}::text[]) AS vid
        ON CONFLICT ("videoId", "userId", role) DO NOTHING`;
    }

    // Batch create assignments for co-workers (must be channel members)
    if (coWorkerIds.length > 0 && allVideoIds.length > 0) {
      // Batch validate co-worker membership (replaces N+1 loop)
      const validCoWorkerIds = coWorkerIds.filter((id) => id !== userId);
      if (validCoWorkerIds.length > 0) {
        type CwRow = { userId: string };
        const validMembers = await db.$queryRaw<CwRow[]>`
          SELECT "userId" FROM channel_members
          WHERE "channelId" = ${channelId}
            AND "userId" = ANY(${validCoWorkerIds}::text[])`;
        const validMemberIds = validMembers.map((r) => r.userId);

        // Batch insert for all valid co-workers × all videos
        if (validMemberIds.length > 0) {
          await db.$executeRaw`
            INSERT INTO video_role_assignments (id, "videoId", "userId", role, status, "createdAt")
            SELECT gen_random_uuid(), vid, cw, ${role}::"VideoRole", 'PENDING', NOW()
            FROM unnest(${allVideoIds}::text[]) AS vid
            CROSS JOIN unnest(${validMemberIds}::text[]) AS cw
            ON CONFLICT ("videoId", "userId", role) DO NOTHING`;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      deactivated,
      reactivated: reactivate.length,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    const role = searchParams.get("role"); // WRITER | EDITOR | null (= all)

    if (!channelId) {
      return NextResponse.json({ error: "channelId bắt buộc" }, { status: 400 });
    }

    if (role && !["WRITER", "EDITOR"].includes(role)) {
      return NextResponse.json({ error: "Role không hợp lệ" }, { status: 400 });
    }

    if (role) {
      // Delete role assignments for this role only
      await db.$executeRaw`
        DELETE FROM video_role_assignments
        WHERE "userId" = ${userId}
          AND role = ${role}::"VideoRole"
          AND "videoId" IN (
            SELECT id FROM videos
            WHERE "channelId" = ${channelId} AND "isActive" = true
          )`;

      // Deactivate videos that now have no remaining active role assignments from this user
      await db.$executeRaw`
        UPDATE videos SET "isActive" = false, "updatedAt" = NOW()
        WHERE "submittedBy" = ${userId}
          AND "channelId" = ${channelId}
          AND "isActive" = true
          AND id NOT IN (
            SELECT "videoId" FROM video_role_assignments
            WHERE "userId" = ${userId}
          )`;
    } else {
      // Legacy: deactivate all videos + delete all role assignments for this staff+channel
      await db.$executeRaw`
        DELETE FROM video_role_assignments
        WHERE "userId" = ${userId}
          AND "videoId" IN (
            SELECT id FROM videos
            WHERE "channelId" = ${channelId} AND "submittedBy" = ${userId}
          )`;

      await db.$executeRaw`
        UPDATE videos SET "isActive" = false, "updatedAt" = NOW()
        WHERE "submittedBy" = ${userId}
          AND "channelId" = ${channelId}
          AND "isActive" = true`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
