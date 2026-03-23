export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { approveAssignmentsSchema } from "@/lib/validations/video";
import { revalidatePath } from "next/cache";

// PUT /api/videos/[id]/approve — DIRECTOR only
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("DIRECTOR");
    const userId = session.user.id;

    const videoId = params.id;

    // Check video exists
    const video = await db.video.findUnique({ where: { id: videoId } });
    if (!video) {
      return NextResponse.json({ error: "Video không tồn tại" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = approveAssignmentsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { assignments } = parsed.data;
    const now = new Date();

    const updated = await Promise.all(
      assignments.map(({ assignmentId, action }) =>
        db.videoRoleAssignment.update({
          where: { id: assignmentId },
          data: {
            status: action === "approve" ? "APPROVED" : "REJECTED",
            approvedBy: userId,
            approvedAt: now,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            video: { select: { id: true, title: true } },
          },
        })
      )
    );

    revalidatePath("/director/videos");

    return NextResponse.json({ updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (err.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[PUT /api/videos/[id]/approve]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
