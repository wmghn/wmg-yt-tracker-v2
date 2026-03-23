export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { videoRoleSchema } from "@/lib/validations/video";

// POST /api/videos/[id]/roles — STAFF or MANAGER
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "STAFF" && role !== "MANAGER" && role !== "DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const videoId = params.id;

    // Check video exists
    const video = await db.video.findUnique({ where: { id: videoId } });
    if (!video) {
      return NextResponse.json({ error: "Video không tồn tại" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = videoRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, role: videoRole } = parsed.data;

    // Check if user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Người dùng không tồn tại" }, { status: 404 });
    }

    // Check unique constraint: videoId + userId + role
    const existing = await db.videoRoleAssignment.findUnique({
      where: { videoId_userId_role: { videoId, userId, role: videoRole } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Phân công vai trò này đã tồn tại" },
        { status: 409 }
      );
    }

    const assignment = await db.videoRoleAssignment.create({
      data: {
        videoId,
        userId,
        role: videoRole,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        video: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    console.error("[POST /api/videos/[id]/roles]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
