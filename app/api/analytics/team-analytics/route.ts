export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";

export interface TeamVideoRow {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  totalViews: number;
  coworkers: { userId: string; name: string; role: string }[];
  formula: string;
  viewsReceived: number;
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  primaryRole: "WRITER" | "EDITOR" | null;
  weightPercent: number | null;
  videoCount: number;
  totalViewsReceived: number;
  videos: TeamVideoRow[];
}

/**
 * GET /api/analytics/team-analytics?channelId=...
 * Returns all channel members with their approved video assignments,
 * formula breakdowns, and views-received calculations.
 * Auth: MANAGER (must be channel member) or DIRECTOR
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionRole = session.user.role;
    if (!["STAFF", "MANAGER", "DIRECTOR"].includes(sessionRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId bắt buộc" }, { status: 400 });
    }

    // STAFF and MANAGER must be a member of the channel
    if (sessionRole !== "DIRECTOR") {
      const membership = await db.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Không có quyền truy cập kênh này" }, { status: 403 });
      }
    }

    // ── Weight configs ────────────────────────────────────────────────────────
    const weightConfigRows = await db.channelWeightConfig.findMany({
      where: { channelId, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    const latestWeights: Record<string, number> = {};
    for (const cfg of weightConfigRows) {
      if (!latestWeights[cfg.role]) latestWeights[cfg.role] = Number(cfg.weightPercent);
    }

    // ── All channel members ───────────────────────────────────────────────────
    const members = await db.channelMember.findMany({
      where: { channelId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    });

    // ── All APPROVED role assignments for active videos in this channel ────────
    type AssignmentRow = {
      videoId: string;
      userId: string;
      role: string;
      youtubeVideoId: string;
      title: string;
      viewsCount: bigint;
      userName: string;
    };

    const assignments = await db.$queryRaw<AssignmentRow[]>`
      SELECT
        vra."videoId",
        vra."userId",
        vra.role::text,
        v."youtubeVideoId",
        v.title,
        COALESCE(
          (SELECT vvl."viewsCount"
           FROM video_views_log vvl
           WHERE vvl."videoId" = v.id
           ORDER BY vvl."recordedAt" DESC
           LIMIT 1
          ), 0
        )::bigint AS "viewsCount",
        u.name AS "userName"
      FROM video_role_assignments vra
      JOIN videos v ON v.id = vra."videoId"
      JOIN users u ON u.id = vra."userId"
      WHERE v."channelId" = ${channelId}
        AND v."isActive" = true
        AND vra.status = 'APPROVED'
      ORDER BY v.title ASC`;

    // Count same-role users per video (for weight division)
    const roleCountMap = new Map<string, number>(); // `${videoId}:${role}` → count
    for (const a of assignments) {
      const key = `${a.videoId}:${a.role}`;
      roleCountMap.set(key, (roleCountMap.get(key) ?? 0) + 1);
    }

    // All assignments per video (for coworkers list)
    const videoAssignmentsMap = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const existing = videoAssignmentsMap.get(a.videoId) ?? [];
      if (!existing.find((x) => x.userId === a.userId && x.role === a.role)) {
        existing.push(a);
      }
      videoAssignmentsMap.set(a.videoId, existing);
    }

    // ── Build per-member data ─────────────────────────────────────────────────
    const memberData: TeamMemberRow[] = members
      .map((m) => {
        const myAssignments = assignments.filter((a) => a.userId === m.userId);
        if (myAssignments.length === 0) return null;

        // Group by video
        const videoMap = new Map<string, AssignmentRow[]>();
        for (const a of myAssignments) {
          const existing = videoMap.get(a.videoId) ?? [];
          existing.push(a);
          videoMap.set(a.videoId, existing);
        }

        // Primary role: the role with most video assignments
        const roleCounts: Record<string, number> = {};
        for (const a of myAssignments) roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
        const primaryRole = (
          Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        ) as "WRITER" | "EDITOR" | null;
        const weightPercent = primaryRole ? (latestWeights[primaryRole] ?? null) : null;

        let totalViewsReceived = 0;

        const videos: TeamVideoRow[] = Array.from(videoMap.entries())
          .map(([videoId, memberVideoAssignments]) => {
            const firstA = memberVideoAssignments[0];
            const totalViews = Number(firstA.viewsCount);

            // All coworkers for this video
            const allVideoAssignments = videoAssignmentsMap.get(videoId) ?? [];
            const coworkers = allVideoAssignments.map((a) => ({
              userId: a.userId,
              name: a.userName,
              role: a.role,
            }));

            // Calculate views received per role assignment
            let viewsReceived = 0;
            const formulaParts: string[] = [];

            for (const myA of memberVideoAssignments) {
              const roleWeight = latestWeights[myA.role] ?? 50;
              const sameRoleCount = roleCountMap.get(`${videoId}:${myA.role}`) ?? 1;
              const weighted = totalViews * roleWeight / 100;
              const personal = weighted / sameRoleCount;
              viewsReceived += personal;

              const roleLabel = myA.role === "WRITER" ? "content" : "editor";
              const fViews = totalViews.toLocaleString("vi-VN");
              const fWeighted = Math.round(weighted).toLocaleString("vi-VN");
              const fPersonal = Math.round(personal).toLocaleString("vi-VN");
              formulaParts.push(
                `${fViews} → × ${roleWeight}% → ${fWeighted} → ÷ ${sameRoleCount} ${roleLabel} → = ${fPersonal} views`
              );
            }

            totalViewsReceived += viewsReceived;

            return {
              videoId,
              youtubeVideoId: firstA.youtubeVideoId,
              title: firstA.title,
              totalViews,
              coworkers,
              formula: formulaParts.join("\n"),
              viewsReceived: Math.round(viewsReceived),
            };
          })
          .sort((a, b) => b.viewsReceived - a.viewsReceived);

        return {
          userId: m.userId,
          name: m.user.name,
          primaryRole,
          weightPercent,
          videoCount: videoMap.size,
          totalViewsReceived: Math.round(totalViewsReceived),
          videos,
        };
      })
      .filter((m): m is TeamMemberRow => m !== null);

    return NextResponse.json({ members: memberData, channelId });
  } catch (err) {
    console.error("[GET /api/analytics/team-analytics]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
