import { NextRequest, NextResponse } from "next/server";
import { getServerSession, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createChannelSchema } from "@/lib/validations/channel";
import { youtubeDataAPI } from "@/lib/youtube/data-api";

// GET /api/channels
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const role = session.user.role;
    const userId = session.user.id;

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // MANAGER/STAFF: only channels they are members of
    if (role === "MANAGER" || role === "STAFF") {
      where.members = { some: { userId } };
    }

    const [channels, total] = await Promise.all([
      db.channel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true, videos: true } },
        },
      }),
      db.channel.count({ where }),
    ]);

    return NextResponse.json({
      channels,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/channels]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/channels — DIRECTOR only
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("DIRECTOR");

    const body = await req.json();
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    }

    const { youtubeChannelId, name, description, managerId } = parsed.data;

    // Check duplicate
    const existing = await db.channel.findUnique({ where: { youtubeChannelId } });
    if (existing) {
      return NextResponse.json({ error: "Kênh đã tồn tại trong hệ thống" }, { status: 409 });
    }

    // Validate managerId if provided
    if (managerId) {
      const manager = await db.user.findUnique({ where: { id: managerId } });
      if (!manager) {
        return NextResponse.json({ error: "Manager không tồn tại" }, { status: 400 });
      }
    }

    // Fetch YouTube channel info if API key present
    let ytName = name;
    let ytDescription = description;

    if (process.env.YOUTUBE_API_KEY) {
      try {
        const ytChannel = await youtubeDataAPI.getChannelDetails(youtubeChannelId);
        if (ytChannel) {
          if (!description) ytDescription = ytChannel.description;
          // Keep user-provided name, use YT as fallback
        }
      } catch (ytErr) {
        console.warn("[POST /api/channels] YouTube API error:", ytErr);
        // Non-fatal: continue without YT data
      }
    }

    const channel = await db.channel.create({
      data: {
        youtubeChannelId,
        name: ytName,
        description: ytDescription,
        status: "PENDING_BKT",
        managerId: managerId ?? null,
        createdBy: session.user.id,
      },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(channel, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (err.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[POST /api/channels]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
