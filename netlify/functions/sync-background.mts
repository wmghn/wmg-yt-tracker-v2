import type { Config } from "@netlify/functions";
import { db } from "../../lib/db";
import { syncAnalyticsSnapshots } from "../../lib/analytics/sync";
import type { DateRangeType } from "../../lib/youtube/analytics-api";

/**
 * Netlify Background Function — chạy sync YouTube Analytics ngầm (tối đa 15 phút).
 * Được gọi bởi POST /api/analytics/sync, trả về 202 ngay lập tức.
 *
 * Body: { jobId, channelIds, dateRange, month?, year?, secret }
 */
export default async function handler(req: Request) {
  let jobId = "";

  try {
    const body = await req.json() as {
      jobId: string;
      channelIds: string[];
      dateRange: DateRangeType;
      month?: number;
      year?: number;
      secret: string;
    };

    // Xác thực internal secret để tránh gọi trực tiếp từ ngoài
    const internalSecret = process.env.INTERNAL_SYNC_SECRET;
    if (!internalSecret || body.secret !== internalSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    jobId = body.jobId;

    // Đánh dấu job đang chạy
    await db.syncJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    // Chạy sync thực sự
    const result = await syncAnalyticsSnapshots(
      body.channelIds,
      body.dateRange,
      body.month,
      body.year
    );

    // Lưu kết quả
    await db.syncJob.update({
      where: { id: jobId },
      data: {
        status: result.errors.length > 0 ? "error" : "done",
        result: result as unknown as Record<string, unknown>,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (jobId) {
      await db.syncJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          result: { errors: [msg], channelsSynced: 0, videosSynced: 0, snapshotsUpserted: 0 },
        },
      }).catch(() => {});
    }
  }
}

export const config: Config = {
  type: "background",
};
