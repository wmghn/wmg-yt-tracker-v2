import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/channels/[id]/members-list
 * Returns the list of active members in a channel.
 * Accessible by any authenticated user who is a member of the channel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id as string;
    const channelId = params.id;

    // Must be a member of the channel (DIRECTOR exempt)
    const userRole = (session.user as { role?: string })?.role;
    if (userRole !== "DIRECTOR") {
      const membership = await db.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Không có quyền truy cập kênh này" }, { status: 403 });
      }
    }

    const members = await db.channelMember.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        role: m.user.role,
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
