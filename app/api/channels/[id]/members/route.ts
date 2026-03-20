import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { channelMemberSchema } from "@/lib/validations/channel";

type Params = { params: { id: string } };

// POST /api/channels/[id]/members — MANAGER of channel or DIRECTOR
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = params;
    const role = session.user.role;
    const currentUserId = session.user.id;

    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: { members: { select: { userId: true } } },
    });

    if (!channel) {
      return NextResponse.json({ error: "Kênh không tồn tại" }, { status: 404 });
    }

    // Check permission: DIRECTOR or MANAGER who is manager of this channel
    if (role !== "DIRECTOR") {
      if (role !== "MANAGER" || channel.managerId !== currentUserId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = channelMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    }

    const { userId, action } = parsed.data;

    // Validate user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User không tồn tại" }, { status: 400 });
    }

    if (action === "add") {
      const alreadyMember = channel.members.some((m) => m.userId === userId);
      if (alreadyMember) {
        return NextResponse.json({ error: "User đã là thành viên của kênh" }, { status: 409 });
      }

      const member = await db.channelMember.create({
        data: {
          channelId,
          userId,
          addedBy: currentUserId,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      return NextResponse.json(member, { status: 201 });
    } else {
      // action === "remove"
      const isMember = channel.members.some((m) => m.userId === userId);
      if (!isMember) {
        return NextResponse.json({ error: "User không phải thành viên của kênh" }, { status: 400 });
      }

      await db.channelMember.delete({
        where: { channelId_userId: { channelId, userId } },
      });

      return NextResponse.json({ message: "Đã xóa thành viên khỏi kênh" });
    }
  } catch (err) {
    console.error("[POST /api/channels/[id]/members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
