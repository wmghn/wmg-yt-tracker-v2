import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { youtubeDataAPI } from "@/lib/youtube/data-api";
import { submitVideosSchema } from "@/lib/validations/video";

// GET /api/videos
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId") ?? undefined;
    const statusFilter = searchParams.get("status") ?? undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const role = session.user.role;
    const userId = session.user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (channelId) {
      where.channelId = channelId;
    }

    if (role === "MANAGER") {
      // Videos in channels where this user is manager
      where.channel = { managerId: userId };
    } else if (role === "STAFF") {
      // Only videos submitted by this user
      where.submittedBy = userId;
    }
    // DIRECTOR: all videos

    // Filter by assignment status
    if (statusFilter) {
      where.roleAssignments = {
        some: { status: statusFilter },
      };
    }

    const [videos, total] = await Promise.all([
      db.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          channel: { select: { id: true, name: true, youtubeChannelId: true } },
          submitter: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              approver: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          viewsLog: {
            orderBy: { recordedAt: "desc" },
            take: 1,
          },
        },
      }),
      db.video.count({ where }),
    ]);

    return NextResponse.json({
      videos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[GET /api/videos]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/videos — STAFF or MANAGER
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    const userId = session.user.id;

    if (role !== "STAFF" && role !== "MANAGER" && role !== "DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = submitVideosSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { videoIds, channelId } = parsed.data;

    // Validate: user must be a member of the channel (DIRECTOR is exempt)
    if (role !== "DIRECTOR") {
      const membership = await db.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Bạn không phải thành viên của kênh này" },
          { status: 403 }
        );
      }
    }

    // Verify channel exists
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: "Kênh không tồn tại" }, { status: 404 });
    }

    // Fetch metadata from YouTube
    let ytDetails: Awaited<ReturnType<typeof youtubeDataAPI.getVideoDetails>> = [];
    if (process.env.YOUTUBE_API_KEY) {
      try {
        ytDetails = await youtubeDataAPI.getVideoDetails(videoIds);
      } catch (ytErr) {
        console.warn("[POST /api/videos] YouTube API error:", ytErr);
      }
    }

    const ytMap = new Map(ytDetails.map((d) => [d.youtubeVideoId, d]));

    let created = 0;
    let skipped = 0;
    const createdVideos = [];

    for (const videoId of videoIds) {
      const existing = await db.video.findUnique({
        where: { youtubeVideoId: videoId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const yt = ytMap.get(videoId);
      const now = new Date();

      const video = await db.video.create({
        data: {
          youtubeVideoId: videoId,
          channelId,
          title: yt?.title ?? videoId,
          thumbnailUrl: yt?.thumbnailUrl ?? null,
          publishedAt: yt?.publishedAt ? new Date(yt.publishedAt) : null,
          submittedBy: userId,
        },
      });

      // Create initial views log
      await db.videoViewsLog.create({
        data: {
          videoId: video.id,
          viewsCount: BigInt(yt?.viewCount ?? 0),
          recordedAt: now,
        },
      });

      created++;
      createdVideos.push(video);
    }

    return NextResponse.json(
      { created, skipped, videos: createdVideos },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/videos]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
