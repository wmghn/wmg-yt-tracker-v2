// YouTube Analytics API wrapper — requires OAuth token per channel

export type DateRangeType =
  | "7days"
  | "28days"
  | "90days"
  | "365days"
  | "lifetime"
  | "month"
  | "year"
  | "custom";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

export function resolveDateRange(type: DateRangeType, month?: number, year?: number): DateRange {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (type === "7days") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { startDate: fmt(from), endDate: fmt(today), label: "7 ngày qua" };
  }

  if (type === "28days") {
    const from = new Date(today);
    from.setDate(from.getDate() - 27);
    return { startDate: fmt(from), endDate: fmt(today), label: "28 ngày qua" };
  }

  if (type === "90days") {
    const from = new Date(today);
    from.setDate(from.getDate() - 89);
    return { startDate: fmt(from), endDate: fmt(today), label: "90 ngày qua" };
  }

  if (type === "365days") {
    const from = new Date(today);
    from.setDate(from.getDate() - 364);
    return { startDate: fmt(from), endDate: fmt(today), label: "365 ngày qua" };
  }

  if (type === "lifetime") {
    return { startDate: "2020-01-01", endDate: fmt(today), label: "Toàn thời gian" };
  }

  if (type === "month") {
    const m = month ?? today.getMonth() + 1;
    const y = year ?? today.getFullYear();
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    const label = from.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
    return { startDate: fmt(from), endDate: fmt(to), label };
  }

  if (type === "year") {
    const y = year ?? today.getFullYear();
    return {
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
      label: `Năm ${y}`,
    };
  }

  // fallback: 28 days
  const from = new Date(today);
  from.setDate(from.getDate() - 27);
  return { startDate: fmt(from), endDate: fmt(today), label: "28 ngày qua" };
}

export interface AnalyticsMetrics {
  date?: string;
  views: number;
  estimatedMinutesWatched?: number;
  averageViewDuration?: number;
  subscribersGained?: number;
  estimatedRevenue?: number;
  cpm?: number;
  likes?: number;
  comments?: number;
}

const METRIC_KEY_MAP: Record<string, string> = {
  views: "views",
  watchTime: "estimatedMinutesWatched",
  avgViewDuration: "averageViewDuration",
  subscribers: "subscribersGained",
  revenue: "estimatedRevenue",
  cpm: "playbackBasedCpm",
  likes: "likes",
  comments: "comments",
};

const API_METRIC_RESULT_MAP: Record<string, keyof AnalyticsMetrics> = {
  views: "views",
  estimatedMinutesWatched: "estimatedMinutesWatched",
  averageViewDuration: "averageViewDuration",
  subscribersGained: "subscribersGained",
  estimatedRevenue: "estimatedRevenue",
  playbackBasedCpm: "cpm",   // YouTube Analytics API name for CPM
  likes: "likes",
  comments: "comments",
};

export type RevenueData = {
  videoId: string;
  estimatedRevenue: number | null;
  cpm: number | null;
};

export class YouTubeAnalyticsAPI {
  private mapMetricKey(key: string): string {
    return METRIC_KEY_MAP[key] ?? key;
  }

  async getVideoMetrics(
    accessToken: string,
    youtubeVideoId: string,
    dateRange: DateRange,
    metricKeys: string[] = ["views"]
  ): Promise<AnalyticsMetrics[]> {
    const apiMetrics = metricKeys.map((k) => this.mapMetricKey(k));
    // Add date dimension for daily breakdown
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      metrics: apiMetrics.join(","),
      dimensions: "day",
      filters: `video==${youtubeVideoId}`,
      sort: "day",
    });

    try {
      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) return [];

      const data = await res.json();
      const colHeaders: string[] = (data.columnHeaders ?? []).map((h: { name: string }) => h.name);
      const rows: (number | string)[][] = data.rows ?? [];

      return rows.map((row) => {
        const entry: AnalyticsMetrics = { views: 0 };
        colHeaders.forEach((col, i) => {
          if (col === "day") {
            entry.date = String(row[i]);
          } else {
            const key = API_METRIC_RESULT_MAP[col];
            if (key) (entry as unknown as Record<string, unknown>)[key] = Number(row[i] ?? 0);
          }
        });
        return entry;
      });
    } catch {
      return [];
    }
  }

  async getMultiVideoMetrics(
    accessToken: string,
    youtubeVideoIds: string[],
    dateRange: DateRange,
    metricKeys: string[] = ["views"]
  ): Promise<{ byDate: AnalyticsMetrics[]; totals: AnalyticsMetrics }> {
    if (youtubeVideoIds.length === 0) {
      return { byDate: [], totals: { views: 0 } };
    }

    // Fetch all in parallel (max 50 at a time)
    const chunks: string[][] = [];
    for (let i = 0; i < youtubeVideoIds.length; i += 50) {
      chunks.push(youtubeVideoIds.slice(i, i + 50));
    }

    const allResults = await Promise.all(
      chunks.flatMap((chunk) =>
        chunk.map((vid) => this.getVideoMetrics(accessToken, vid, dateRange, metricKeys))
      )
    );

    // Aggregate by date
    const byDateMap = new Map<string, AnalyticsMetrics>();
    for (const results of allResults) {
      for (const entry of results) {
        const date = entry.date ?? "unknown";
        const existing = byDateMap.get(date) ?? { date, views: 0 };
        for (const k of Object.keys(entry) as (keyof AnalyticsMetrics)[]) {
          if (k === "date") continue;
          const v = entry[k] as number | undefined;
          if (v !== undefined) {
            (existing as unknown as Record<string, unknown>)[k] = ((existing[k] as number) ?? 0) + v;
          }
        }
        byDateMap.set(date, existing);
      }
    }

    const byDate = Array.from(byDateMap.values()).sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "")
    );

    // Sum totals
    const totals: AnalyticsMetrics = { views: 0 };
    for (const entry of byDate) {
      for (const k of Object.keys(entry) as (keyof AnalyticsMetrics)[]) {
        if (k === "date") continue;
        const v = entry[k] as number | undefined;
        if (v !== undefined) {
          (totals as unknown as Record<string, unknown>)[k] = ((totals[k] as number) ?? 0) + v;
        }
      }
    }

    return { byDate, totals };
  }

  /**
   * Fetches total views per video for a channel over the given date range.
   *
   * Uses the YouTube Analytics API v2 "User activity by video" channel report:
   *   ids=channel==MINE, dimensions=video, metrics=views,estimatedMinutesWatched
   *
   * NOTE: dimensions=video,day is NOT valid for channel reports (ids=channel==MINE).
   * It is only valid for content owner reports. Channel reports only support
   * dimensions=video (aggregated totals for the whole date range).
   *
   * Paginated via pageToken.
   */
  async getChannelVideoViews(
    accessToken: string,
    dateRange: DateRange,
    youtubeChannelId?: string
  ): Promise<Array<{ ytVideoId: string } & AnalyticsMetrics>> {
    // Use the specific channel ID when provided (required for brand channels).
    // Falling back to "MINE" only works for the main personal channel.
    const channelFilter = youtubeChannelId
      ? `channel==${youtubeChannelId}`
      : "channel==MINE";

    const fetchPage = async (
      pageToken?: string
    ): Promise<{ rows: (string | number)[][]; colHeaders: string[]; nextPageToken?: string }> => {
      const params = new URLSearchParams({
        ids: channelFilter,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: "views,estimatedMinutesWatched",
        dimensions: "video",
        sort: "-views",
        maxResults: "200",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (res.status === 403) throw new Error("FORBIDDEN_403");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`API_ERROR_${res.status}: ${JSON.stringify(body)}`);
      }

      const data = await res.json();
      return {
        rows: data.rows ?? [],
        colHeaders: (data.columnHeaders ?? []).map((h: { name: string }) => h.name),
        nextPageToken: data.nextPageToken as string | undefined,
      };
    };

    const allRows: Array<{ ytVideoId: string } & AnalyticsMetrics> = [];
    let pageToken: string | undefined;

    do {
      const { rows, colHeaders, nextPageToken } = await fetchPage(pageToken);
      for (const row of rows) {
        const entry: { ytVideoId: string } & AnalyticsMetrics = { ytVideoId: "", views: 0 };
        colHeaders.forEach((col, i) => {
          if (col === "video") entry.ytVideoId = String(row[i]);
          else {
            const key = API_METRIC_RESULT_MAP[col];
            if (key) (entry as unknown as Record<string, unknown>)[key] = Number(row[i] ?? 0);
          }
        });
        if (entry.ytVideoId) allRows.push(entry);
      }
      pageToken = nextPageToken;
    } while (pageToken);

    return allRows;
  }

  /** @deprecated Use getChannelVideoViews instead */
  async getAllChannelDailyMetrics(
    accessToken: string,
    dateRange: DateRange
  ): Promise<Array<{ ytVideoId: string; date: string } & AnalyticsMetrics>> {
    const rows = await this.getChannelVideoViews(accessToken, dateRange);
    return rows.map((r) => ({ ...r, date: dateRange.endDate }));
  }

  async getVideoRevenue(videoId: string, accessToken: string): Promise<RevenueData> {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      metrics: "estimatedRevenue,playbackBasedCpm",
      dimensions: "video",
      filters: `video==${videoId}`,
      startDate: "2020-01-01",
      endDate: new Date().toISOString().split("T")[0]!,
    });

    try {
      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (res.status === 403) {
        return { videoId, estimatedRevenue: null, cpm: null };
      }

      if (!res.ok) throw new Error(`Analytics API error: ${res.status}`);

      const data = await res.json();
      const row = data.rows?.[0] ?? [];
      return {
        videoId,
        estimatedRevenue: row[0] ?? null,
        cpm: row[1] ?? null,
      };
    } catch {
      return { videoId, estimatedRevenue: null, cpm: null };
    }
  }
}

export const youtubeAnalyticsAPI = new YouTubeAnalyticsAPI();
