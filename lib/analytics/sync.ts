import { db } from "@/lib/db";
import { youtubeAnalyticsAPI, resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";
import { getValidAccessToken } from "@/lib/youtube/token";
import { fetchVideoMetadataBatch } from "@/lib/youtube/data-api";

export interface SyncResult {
  channelsSynced: number;
  videosSynced: number;
  snapshotsUpserted: number;
  errors: string[];
}

/** Delay helper — wait `ms` milliseconds between channels to avoid YouTube API rate limits */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Syncs YouTube Analytics data into AnalyticsSnapshot.
 *
 * Uses "User activity by video" channel report (dimensions=video, not video,day)
 * which is the only valid format for ids=channel==MINE.
 *
 * Each sync stores ONE snapshot per video keyed by the endDate of the date range.
 * This represents total views for the selected period (e.g. whole month of March).
 */
export async function syncAnalyticsSnapshots(
  channelIds: string[],
  rangeType: DateRangeType,
  month?: number,
  year?: number
): Promise<SyncResult> {
  const result: SyncResult = {
    channelsSynced: 0,
    videosSynced: 0,
    snapshotsUpserted: 0,
    errors: [],
  };

  const dateRange = resolveDateRange(rangeType, month, year);
  const snapshotStartDate = dateRange.startDate; // YYYY-MM-DD (range start)

  const channels = await db.channel.findMany({
    where: {
      status: "ACTIVE",
      ...(channelIds.length > 0 ? { id: { in: channelIds } } : {}),
      oauthTokenId: { not: null },
    },
    select: { id: true, name: true, youtubeChannelId: true },
  });

  if (channels.length === 0) {
    result.errors.push(
      "Không có kênh nào có OAuth token. Vào trang kênh → tab YouTube để kết nối."
    );
    return result;
  }

  for (let idx = 0; idx < channels.length; idx++) {
    const channel = channels[idx];

    // Stagger: wait 5 seconds between channels to avoid YouTube API rate limits.
    // Skip delay for the first channel.
    if (idx > 0) {
      console.log(`[syncAnalyticsSnapshots] Waiting 5s before channel "${channel.name}" (${idx + 1}/${channels.length})…`);
      await delay(5_000);
    }

    const accessToken = await getValidAccessToken(channel.id);
    if (!accessToken) {
      result.errors.push(`Kênh "${channel.name}": không lấy được access token.`);
      continue;
    }

    try {
      // Fetch total views per video for the date range (dimensions=video, aggregated).
      // Pass the stored YouTube channel ID so brand channels are queried correctly.
      const rows = await youtubeAnalyticsAPI.getChannelVideoViews(
        accessToken,
        dateRange,
        channel.youtubeChannelId ?? undefined
      );

      if (rows.length === 0) continue;

      const ytIds = rows.map((r) => r.ytVideoId);

      // Match to existing Video records
      const existingVideos = await db.video.findMany({
        where: { youtubeVideoId: { in: ytIds } },
        select: { id: true, youtubeVideoId: true },
      });
      const ytToInternal = new Map(existingVideos.map((v) => [v.youtubeVideoId, v.id]));

      // Fetch YouTube metadata ONLY for unknown video IDs (saves API quota)
      const missingYtIds = ytIds.filter((id) => !ytToInternal.has(id));
      const missingMetadata = missingYtIds.length > 0
        ? await fetchVideoMetadataBatch(missingYtIds)
        : [];
      const metaMap = new Map(missingMetadata.map((m) => [m.youtubeVideoId, m]));

      // Create new Video records for unknown videos
      if (missingYtIds.length > 0) {
        for (const ytId of missingYtIds) {
          const meta = metaMap.get(ytId);
          if (!meta) continue;
          try {
            const created = await db.video.upsert({
              where: { youtubeVideoId: meta.youtubeVideoId },
              update: { title: meta.title, thumbnailUrl: meta.thumbnailUrl ?? null },
              create: {
                youtubeVideoId: meta.youtubeVideoId,
                title: meta.title,
                thumbnailUrl: meta.thumbnailUrl ?? null,
                channel: { connect: { id: channel.id } },
                isActive: true,
              },
            });
            ytToInternal.set(meta.youtubeVideoId, created.id);
          } catch (err) {
            console.error(`[syncAnalyticsSnapshots] Failed to upsert video "${ytId}":`, err);
          }
        }
      }

      // Save one AnalyticsSnapshot per video per (startDate, endDate) pair.
      // Unique key is (videoId, startDate, date) so "7 days" and "28 days"
      // synced on the same day are stored separately and never overwrite each other.
      const startDateStr = snapshotStartDate; // YYYY-MM-DD
      const dateStr = dateRange.endDate;      // YYYY-MM-DD (use string directly, avoid toISOString UTC shift)

      for (const row of rows) {
        const internalId = ytToInternal.get(row.ytVideoId);
        if (!internalId) continue;

        const views = BigInt(Math.round(row.views ?? 0));
        const watchTime = row.estimatedMinutesWatched ?? null;

        await db.$executeRaw`
          INSERT INTO analytics_snapshots (id, "videoId", "startDate", date, views, "estimatedMinutesWatched", "fetchedAt")
          VALUES (gen_random_uuid(), ${internalId}, ${startDateStr}::date, ${dateStr}::date, ${views}::bigint, ${watchTime}::decimal, now())
          ON CONFLICT ("videoId", "startDate", date)
          DO UPDATE SET
            views = EXCLUDED.views,
            "estimatedMinutesWatched" = EXCLUDED."estimatedMinutesWatched",
            "fetchedAt" = now()
        `;

        result.snapshotsUpserted++;
        result.videosSynced++;
      }

      result.channelsSynced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Kênh "${channel.name}": ${msg}`);
    }
  }

  return result;
}
