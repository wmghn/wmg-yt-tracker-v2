const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

export type VideoDetails = {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  channelId: string;
};

export type ChannelDetails = {
  youtubeChannelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
};

export class YouTubeDataAPI {
  async getVideoDetails(videoIds: string[]): Promise<VideoDetails[]> {
    if (videoIds.length === 0) return [];

    const chunks = this.chunk(videoIds, 50);
    const results: VideoDetails[] = [];

    for (const chunk of chunks) {
      const params = new URLSearchParams({
        part: "snippet,statistics",
        id: chunk.join(","),
        key: YOUTUBE_API_KEY,
      });

      const res = await fetch(`${BASE_URL}/videos?${params}`);
      if (!res.ok) {
        const err = await res.json();
        if (err.error?.errors?.[0]?.reason === "quotaExceeded") {
          throw new Error("YOUTUBE_QUOTA_EXCEEDED");
        }
        throw new Error(`YouTube API error: ${res.status}`);
      }

      const data = await res.json();
      for (const item of data.items ?? []) {
        results.push({
          youtubeVideoId: item.id,
          title: item.snippet.title,
          thumbnailUrl:
            item.snippet.thumbnails?.medium?.url ??
            item.snippet.thumbnails?.default?.url ??
            "",
          publishedAt: item.snippet.publishedAt,
          viewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
          channelId: item.snippet.channelId,
        });
      }
    }

    return results;
  }

  async getChannelDetails(channelId: string): Promise<ChannelDetails | null> {
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: channelId,
      key: YOUTUBE_API_KEY,
    });

    const res = await fetch(`${BASE_URL}/channels?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      youtubeChannelId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
    };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }
}

export const youtubeDataAPI = new YouTubeDataAPI();

/** Convenience wrapper used by sync.ts to get title+thumbnail for unknown video IDs */
export async function fetchVideoMetadataBatch(
  youtubeVideoIds: string[]
): Promise<{ youtubeVideoId: string; title: string; thumbnailUrl?: string }[]> {
  if (youtubeVideoIds.length === 0) return [];
  try {
    const details = await youtubeDataAPI.getVideoDetails(youtubeVideoIds);
    return details.map((d) => ({
      youtubeVideoId: d.youtubeVideoId,
      title: d.title,
      thumbnailUrl: d.thumbnailUrl || undefined,
    }));
  } catch (err) {
    // If Data API fails (no key, quota, key restriction), return stubs so sync still works
    console.error("[fetchVideoMetadataBatch] YouTube Data API error:", err);
    return youtubeVideoIds.map((id) => ({ youtubeVideoId: id, title: id }));
  }
}
