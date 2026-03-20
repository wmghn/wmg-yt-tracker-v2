import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { youtubeDataAPI } from "@/lib/youtube/data-api";

// GET /api/videos/preview?ids=id1,id2,...
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^[a-zA-Z0-9_-]{11}$/.test(id))
      .slice(0, 50);

    if (ids.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    if (!process.env.YOUTUBE_API_KEY) {
      // Return stub data when no API key
      const stubs = ids.map((id) => ({
        youtubeVideoId: id,
        title: `Video ${id}`,
        thumbnailUrl: "",
        viewCount: 0,
      }));
      return NextResponse.json({ videos: stubs });
    }

    const videos = await youtubeDataAPI.getVideoDetails(ids);

    return NextResponse.json({ videos });
  } catch (err) {
    console.error("[GET /api/videos/preview]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
