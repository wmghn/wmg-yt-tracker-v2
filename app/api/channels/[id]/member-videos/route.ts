import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { youtubeDataAPI } from "@/lib/youtube/data-api";

/**
 * GET /api/channels/[id]/member-videos
 * Returns video IDs per member for this channel.
 * - Without ?userId: summary for all members (writerCount, editorCount, first 5 IDs each)
 * - With ?userId=...: full writerIds and editorIds for that member
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    const channelId = params.id;

    if (role !== "MANAGER" && role !== "DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Manager must be a member of the channel
    if (role === "MANAGER") {
      const membership = await db.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Không có quyền truy cập kênh này" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    if (targetUserId) {
      // Full video IDs for a specific member
      type Row = { youtubeVideoId: string; role: string };
      const rows = await db.$queryRaw<Row[]>`
        SELECT v."youtubeVideoId", vra.role::text
        FROM video_role_assignments vra
        JOIN videos v ON v.id = vra."videoId"
        WHERE vra."userId" = ${targetUserId}
          AND v."channelId" = ${channelId}
          AND v."isActive" = true
          AND vra.status IN ('PENDING', 'APPROVED')
        ORDER BY v.title ASC`;

      const writerIds = rows.filter((r) => r.role === "WRITER").map((r) => r.youtubeVideoId);
      const editorIds = rows.filter((r) => r.role === "EDITOR").map((r) => r.youtubeVideoId);

      return NextResponse.json({ writerIds, editorIds });
    }

    // Summary for all members
    type SummaryRow = {
      userId: string;
      role: string;
      youtubeVideoId: string;
    };
    const rows = await db.$queryRaw<SummaryRow[]>`
      SELECT vra."userId", vra.role::text, v."youtubeVideoId"
      FROM video_role_assignments vra
      JOIN videos v ON v.id = vra."videoId"
      JOIN channel_members cm ON cm."userId" = vra."userId" AND cm."channelId" = ${channelId}
      WHERE v."channelId" = ${channelId}
        AND v."isActive" = true
        AND vra.status IN ('PENDING', 'APPROVED')
      ORDER BY v.title ASC`;

    // Group by userId
    const memberMap = new Map<string, { writerIds: string[]; editorIds: string[] }>();
    for (const r of rows) {
      if (!memberMap.has(r.userId)) {
        memberMap.set(r.userId, { writerIds: [], editorIds: [] });
      }
      const entry = memberMap.get(r.userId)!;
      if (r.role === "WRITER") entry.writerIds.push(r.youtubeVideoId);
      else if (r.role === "EDITOR") entry.editorIds.push(r.youtubeVideoId);
    }

    const summary = Array.from(memberMap.entries()).map(([userId, data]) => ({
      userId,
      writerCount: data.writerIds.length,
      editorCount: data.editorIds.length,
      previewWriterIds: data.writerIds.slice(0, 5),
      previewEditorIds: data.editorIds.slice(0, 5),
    }));

    return NextResponse.json({ members: summary });
  } catch (err) {
    console.error("[GET /api/channels/[id]/member-videos]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/channels/[id]/member-videos
 * Manager/Director syncs video IDs for a specific member.
 * Body: { userId, role: "WRITER"|"EDITOR", videoIds: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionRole = session.user.role;
    const channelId = params.id;

    if (sessionRole !== "MANAGER" && sessionRole !== "DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Manager must be a member of the channel
    if (sessionRole === "MANAGER") {
      const membership = await db.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Không có quyền truy cập kênh này" }, { status: 403 });
      }
    }

    const body = await req.json();
    const targetUserId: string = body.userId;
    const role: string = body.role ?? "WRITER";
    const newIds: string[] = body.videoIds ?? [];

    if (!targetUserId) {
      return NextResponse.json({ error: "userId bắt buộc" }, { status: 400 });
    }
    if (!["WRITER", "EDITOR"].includes(role)) {
      return NextResponse.json({ error: "Role không hợp lệ" }, { status: 400 });
    }

    // Target user must be a channel member
    const targetMembership = await db.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
    if (!targetMembership) {
      return NextResponse.json({ error: "Người dùng không phải thành viên kênh này" }, { status: 400 });
    }

    const validIds = Array.from(new Set(
      newIds.map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{11}$/.test(s))
    ));

    // Current videos submitted by this user for this channel with this role assignment
    type VideoRow = { id: string; youtubeVideoId: string };
    const existingWithRole = await db.$queryRaw<VideoRow[]>`
      SELECT v.id, v."youtubeVideoId"
      FROM videos v
      JOIN video_role_assignments vra ON vra."videoId" = v.id
      WHERE v."channelId" = ${channelId}
        AND vra."userId" = ${targetUserId}
        AND vra.role = ${role}::"VideoRole"`;

    const newSet = new Set(validIds);

    // Remove role assignments for videos no longer in the list
    const toRemoveRole = existingWithRole
      .filter((v) => !newSet.has(v.youtubeVideoId))
      .map((v) => v.id);

    let deactivated = 0;
    if (toRemoveRole.length > 0) {
      await db.$executeRaw`
        DELETE FROM video_role_assignments
        WHERE "userId" = ${targetUserId}
          AND role = ${role}::"VideoRole"
          AND "videoId" = ANY(${toRemoveRole}::text[])`;

      // Deactivate videos that now have no remaining role assignments
      await db.$executeRaw`
        UPDATE videos SET "isActive" = false, "updatedAt" = NOW()
        WHERE id = ANY(${toRemoveRole}::text[])
          AND "channelId" = ${channelId}
          AND id NOT IN (
            SELECT "videoId" FROM video_role_assignments
          )`;
      deactivated = toRemoveRole.length;
    }

    // Re-activate any previously deactivated videos that are back in the list
    type InactiveRow = { id: string; youtubeVideoId: string };
    const reactivate = await db.$queryRaw<InactiveRow[]>`
      SELECT id, "youtubeVideoId"
      FROM videos
      WHERE "youtubeVideoId" = ANY(${validIds}::text[])
        AND "channelId" = ${channelId}
        AND "isActive" = false`;

    if (reactivate.length > 0) {
      const reactivateIds = reactivate.map((v) => v.id);
      await db.$executeRaw`
        UPDATE videos SET "isActive" = true, "updatedAt" = NOW()
        WHERE id = ANY(${reactivateIds}::text[])`;
    }

    // IDs that need to be created (not yet in DB for this channel)
    type ExistingRow = { id: string; youtubeVideoId: string };
    const allExisting = await db.$queryRaw<ExistingRow[]>`
      SELECT id, "youtubeVideoId" FROM videos WHERE "channelId" = ${channelId}`;
    const allExistingMap = new Map(allExisting.map((v) => [v.youtubeVideoId, v.id]));

    const toCreate = validIds.filter((id) => !allExistingMap.has(id));

    // Fetch YouTube metadata for new videos
    let ytMap = new Map<string, { title: string; thumbnailUrl: string | null; publishedAt: string | null; viewCount: number }>();
    if (toCreate.length > 0 && process.env.YOUTUBE_API_KEY) {
      try {
        const ytDetails = await youtubeDataAPI.getVideoDetails(toCreate);
        ytMap = new Map(ytDetails.map((d) => [d.youtubeVideoId, d]));
      } catch { /* non-fatal */ }
    }

    let created = 0;
    for (const ytId of toCreate) {
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
          ${targetUserId},
          true,
          NOW(), NOW()
        )
        ON CONFLICT ("youtubeVideoId") DO NOTHING`;
      created++;
    }

    // Rebuild allExistingMap after insertions
    const allExistingAfter = await db.$queryRaw<ExistingRow[]>`
      SELECT id, "youtubeVideoId" FROM videos WHERE "channelId" = ${channelId}`;
    const allExistingMapAfter = new Map(allExistingAfter.map((v) => [v.youtubeVideoId, v.id]));

    // Upsert VideoRoleAssignment for all valid IDs
    for (const ytId of validIds) {
      const videoId = allExistingMapAfter.get(ytId);
      if (!videoId) continue;
      await db.$executeRaw`
        INSERT INTO video_role_assignments (id, "videoId", "userId", role, status, "createdAt")
        VALUES (gen_random_uuid(), ${videoId}, ${targetUserId}, ${role}::"VideoRole", 'PENDING', NOW())
        ON CONFLICT ("videoId", "userId", role) DO NOTHING`;
    }

    return NextResponse.json({
      ok: true,
      created,
      deactivated,
      reactivated: reactivate.length,
    });
  } catch (err) {
    console.error("[POST /api/channels/[id]/member-videos]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
