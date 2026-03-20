import { db } from "@/lib/db";
import { youtubeDataAPI } from "@/lib/youtube/data-api";

export type SnapshotResult = {
  processed: number;
  skipped: number;
  errors: Array<{ videoId: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff for YOUTUBE_QUOTA_EXCEEDED only
// ---------------------------------------------------------------------------
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "YOUTUBE_QUOTA_EXCEEDED"
      ) {
        if (i === maxRetries - 1) throw error;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// ---------------------------------------------------------------------------
// Chunk helper
// ---------------------------------------------------------------------------
function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

// ---------------------------------------------------------------------------
// ViewsSnapshotService
// ---------------------------------------------------------------------------
export class ViewsSnapshotService {
  /**
   * Returns active videos inside active channels whose latest recorded views
   * snapshot is either missing or older than 48 hours.
   */
  async getVideosNeedingUpdate(): Promise<
    Array<{ id: string; youtubeVideoId: string; channelId: string }>
  > {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Fetch all active videos in active channels
    const videos = await db.video.findMany({
      where: {
        isActive: true,
        channel: { status: "ACTIVE" },
      },
      select: { id: true, youtubeVideoId: true, channelId: true },
    });

    if (videos.length === 0) return [];

    // Get latest recordedAt per video using groupBy to avoid N+1
    const latestLogs = await db.videoViewsLog.groupBy({
      by: ["videoId"],
      _max: { recordedAt: true },
      where: { videoId: { in: videos.map((v) => v.id) } },
    });

    const latestMap = new Map(
      latestLogs.map((l) => [l.videoId, l._max.recordedAt])
    );

    return videos.filter((v) => {
      const latest = latestMap.get(v.id);
      return !latest || latest < cutoff;
    });
  }

  /**
   * Snapshots a single video: fetches current viewCount from the YouTube Data
   * API and inserts a new VideoViewsLog row.  Never updates existing rows.
   */
  async snapshotVideo(videoId: string, isForced = false): Promise<void> {
    // Resolve internal id → youtubeVideoId
    const video = await db.video.findUnique({
      where: { id: videoId },
      select: { id: true, youtubeVideoId: true, isActive: true },
    });

    if (!video || !video.isActive) return;

    const details = await youtubeDataAPI.getVideoDetails([
      video.youtubeVideoId,
    ]);

    if (details.length === 0) {
      // Video no longer exists on YouTube — mark inactive
      await db.video.update({
        where: { id: videoId },
        data: { isActive: false },
      });
      return;
    }

    const now = new Date();
    await db.videoViewsLog.create({
      data: {
        videoId: video.id,
        viewsCount: BigInt(details[0].viewCount),
        revenueEstimate: null,
        recordedAt: now,
        isForcedUpdate: isForced,
      },
    });
  }

  /**
   * Batch-snapshots a list of internal video IDs.
   *
   * - Splits into chunks of 50 (YouTube API limit).
   * - Retries up to 3 times with exponential backoff on quota errors.
   * - Videos absent from the YouTube response are marked isActive=false.
   * - Never throws — quota errors are logged and the chunk is skipped.
   */
  async batchSnapshot(
    videoIds: string[],
    isForced = false
  ): Promise<SnapshotResult> {
    const result: SnapshotResult = { processed: 0, skipped: 0, errors: [] };

    if (videoIds.length === 0) return result;

    // Resolve internal ids → youtube ids in one query
    const videos = await db.video.findMany({
      where: { id: { in: videoIds }, isActive: true },
      select: { id: true, youtubeVideoId: true },
    });

    // Build lookup: youtubeVideoId → internal id
    const ytIdToInternalId = new Map(
      videos.map((v) => [v.youtubeVideoId, v.id])
    );
    const youtubeIds = videos.map((v) => v.youtubeVideoId);

    // Skipped = videoIds that are already inactive or not found in DB
    result.skipped += videoIds.length - videos.length;

    const chunks = chunk(youtubeIds, 50);
    const now = new Date();

    for (const ytChunk of chunks) {
      let details;

      try {
        details = await withRetry(() =>
          youtubeDataAPI.getVideoDetails(ytChunk)
        );
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Unknown error";

        if (errMsg === "YOUTUBE_QUOTA_EXCEEDED") {
          console.warn(
            "[ViewsSnapshotService] YouTube quota exceeded — skipping chunk of",
            ytChunk.length,
            "videos"
          );
          result.skipped += ytChunk.length;
        } else {
          for (const ytId of ytChunk) {
            const internalId = ytIdToInternalId.get(ytId) ?? ytId;
            result.errors.push({ videoId: internalId, error: errMsg });
          }
        }
        continue;
      }

      // Determine which youtube IDs came back from the API
      const returnedYtIds = new Set(details.map((d) => d.youtubeVideoId));

      // Videos missing from YouTube response → mark inactive
      const missingYtIds = ytChunk.filter((id) => !returnedYtIds.has(id));
      if (missingYtIds.length > 0) {
        const missingInternalIds = missingYtIds
          .map((ytId) => ytIdToInternalId.get(ytId))
          .filter((id): id is string => id !== undefined);

        await db.video.updateMany({
          where: { id: { in: missingInternalIds } },
          data: { isActive: false },
        });
        result.skipped += missingInternalIds.length;
      }

      // Bulk-insert log rows for videos that were returned
      const logData = details
        .map((d) => {
          const internalId = ytIdToInternalId.get(d.youtubeVideoId);
          if (!internalId) return null;
          return {
            videoId: internalId,
            viewsCount: BigInt(d.viewCount),
            revenueEstimate: null,
            recordedAt: now,
            isForcedUpdate: isForced,
          };
        })
        .filter(
          (
            row
          ): row is {
            videoId: string;
            viewsCount: bigint;
            revenueEstimate: null;
            recordedAt: Date;
            isForcedUpdate: boolean;
          } => row !== null
        );

      if (logData.length > 0) {
        await db.videoViewsLog.createMany({ data: logData });
        result.processed += logData.length;
      }
    }

    return result;
  }

  /**
   * Returns the most recent views snapshot for a given internal video ID.
   */
  async getLatestViews(
    videoId: string
  ): Promise<{ viewsCount: bigint; recordedAt: Date } | null> {
    const log = await db.videoViewsLog.findFirst({
      where: { videoId },
      orderBy: { recordedAt: "desc" },
      select: { viewsCount: true, recordedAt: true },
    });

    if (!log) return null;
    return { viewsCount: log.viewsCount, recordedAt: log.recordedAt };
  }

  /**
   * Main sync entry-point: resolves all videos needing an update then runs
   * batchSnapshot over them.
   */
  async syncAll(): Promise<SnapshotResult> {
    const videosToUpdate = await this.getVideosNeedingUpdate();

    if (videosToUpdate.length === 0) {
      return { processed: 0, skipped: 0, errors: [] };
    }

    const ids = videosToUpdate.map((v) => v.id);
    return this.batchSnapshot(ids, false);
  }
}

export const viewsSnapshotService = new ViewsSnapshotService();
