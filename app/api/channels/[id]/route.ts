export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateChannelSchema } from "@/lib/validations/channel";

type Params = { params: { id: string } };

// GET /api/channels/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const role = session.user.role;
    const userId = session.user.id;

    const channel = await db.channel.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        weightConfigs: { orderBy: { effectiveFrom: "desc" } },
        _count: { select: { videos: true, members: true } },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Kênh không tồn tại" }, { status: 404 });
    }

    // MANAGER/STAFF: can only view their own channels
    if (role === "MANAGER" || role === "STAFF") {
      const isMember = channel.members.some((m) => m.userId === userId);
      if (!isMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(channel);
  } catch (err) {
    console.error("[GET /api/channels/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/channels/[id] — DIRECTOR only
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireRole("DIRECTOR");

    const { id } = params;
    const body = await req.json();
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await db.channel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Kênh không tồn tại" }, { status: 404 });
    }

    const { name, description, status, managerId } = parsed.data;

    // If managerId provided, validate
    if (managerId !== undefined && managerId !== null) {
      const manager = await db.user.findUnique({ where: { id: managerId } });
      if (!manager) {
        return NextResponse.json({ error: "Manager không tồn tại" }, { status: 400 });
      }
    }

    const channel = await db.channel.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(managerId !== undefined && { managerId }),
      },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { videos: true, members: true } },
      },
    });

    // When setting INACTIVE: deactivate all videos in channel
    if (status === "INACTIVE") {
      await db.video.updateMany({
        where: { channelId: id },
        data: { isActive: false },
      });
    }

    return NextResponse.json(channel);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (err.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[PUT /api/channels/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
