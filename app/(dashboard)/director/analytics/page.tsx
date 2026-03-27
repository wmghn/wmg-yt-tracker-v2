"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Eye,
  Video,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SyncButton } from "@/components/analytics/sync-button";
import { DateRangeDropdown, type DateRangeValue } from "@/components/analytics/date-range-dropdown";
import { ChannelDropdown } from "@/components/analytics/channel-dropdown";
import { VideoIdCell } from "@/components/analytics/video-id-cell";
import { LocalTeamManager } from "@/components/analytics/local-team-manager";
import { SampleExportPanel } from "@/components/analytics/sample-export-panel";
import { resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";

interface Channel {
  id: string;
  name: string;
}

interface TopVideo {
  videoId: string;
  youtubeVideoId: string;
  _youtubeVideoId?: string; // local override after edit
  title: string;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  channelName?: string;
  staff: { name: string; role: string }[];
  metrics: { views: number };
}

interface StaffRow {
  id: string;
  name: string;
  email: string;
  views: number;
  videoCount: number;
}

interface AnalyticsData {
  dateRange: { startDate: string; endDate: string; label: string };
  dataSource: string;
  mode: "channel" | "overview";
  lastSyncedAt: string | null;
  summary: { views: number; videoCount: number; staffCount: number };
  topVideos: TopVideo[];
  staffBreakdown: StaffRow[];
  channels: Channel[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("vi-VN");
}

function exportViewsXlsx(videos: TopVideo[], label: string) {
  const header = ["STT", "Tiêu đề video", "Video ID", "Số views", "Link video"];
  const rows = videos.map((v, i) => [
    i + 1,
    v.title || "",
    v._youtubeVideoId ?? v.youtubeVideoId,
    v.metrics.views,
    `https://www.youtube.com/watch?v=${v._youtubeVideoId ?? v.youtubeVideoId}`,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 14 }, { wch: 12 }, { wch: 46 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Views");
  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `views-${label}-${ts}.xlsx`);
}

function parseDateRange(params: URLSearchParams): DateRangeValue {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const type = (params.get("dateRange") ?? "month") as DateRangeType;
  const month = params.get("month") ? Number(params.get("month")) : (type === "month" ? currentMonth : undefined);
  const year = params.get("year") ? Number(params.get("year")) : (type === "month" ? currentYear : undefined);
  const { label } = resolveDateRange(type, month, year);
  return { type, month, year, label };
}

// ─── Inner page (needs useSearchParams → must be inside Suspense) ─────────────

function DirectorAnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => parseDateRange(searchParams));
  const [selectedChannel, setSelectedChannel] = useState<string>(searchParams.get("channelId") ?? "");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function pushUrl(dr: DateRangeValue, channelId: string) {
    const p = new URLSearchParams();
    p.set("dateRange", dr.type);
    if (dr.month) p.set("month", String(dr.month));
    if (dr.year) p.set("year", String(dr.year));
    if (channelId) p.set("channelId", channelId);
    router.replace(`?${p}`, { scroll: false });
  }

  function handleDateRangeChange(dr: DateRangeValue) {
    setDateRange(dr);
    pushUrl(dr, selectedChannel);
  }

  function handleChannelChange(id: string) {
    setSelectedChannel(id);
    pushUrl(dateRange, id);
  }

  const fetchData = useCallback(async (dr: DateRangeValue, channelId: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateRange: dr.type });
      if (channelId) params.set("channelId", channelId);
      if (dr.month) params.set("month", String(dr.month));
      if (dr.year) params.set("year", String(dr.year));
      const res = await fetch(`/api/analytics/channel-analytics?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Lỗi tải dữ liệu");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-select first channel when channels load (only if none in URL)
  useEffect(() => {
    if (data && data.channels.length > 0 && !selectedChannel) {
      const firstId = data.channels[0].id;
      setSelectedChannel(firstId);
      pushUrl(dateRange, firstId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    fetchData(dateRange, selectedChannel);
  }, [dateRange, selectedChannel, fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Analytics</h1>
          {data?.mode === "channel" && selectedChannel && data.channels.length > 0 && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-sm text-zinc-600">
              {data.channels.find((c) => c.id === selectedChannel)?.name}
            </span>
          )}
        </div>
        {data && (
          data.lastSyncedAt ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Dữ liệu cập nhật lúc{" "}
              {new Date(data.lastSyncedAt).toLocaleString("vi-VN", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Chưa có dữ liệu — nhấn &ldquo;Cập nhật từ YouTube&rdquo;
            </span>
          )
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 ml-auto">
          {data && data.channels.length > 1 && (
            <ChannelDropdown
              channels={data.channels}
              value={selectedChannel}
              onChange={handleChannelChange}
            />
          )}
          <DateRangeDropdown value={dateRange} onChange={handleDateRangeChange} />
          <SyncButton
            channelId={selectedChannel || undefined}
            dateRange={dateRange.type}
            month={dateRange.month}
            year={dateRange.year}
            onDone={() => fetchData(dateRange, selectedChannel)}
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Đang tải dữ liệu...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Tổng Views</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{fmt(data.summary.views)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 shrink-0"><Eye className="h-5 w-5 text-blue-600" /></div>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Video</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{data.summary.videoCount}</p>
                </div>
                <div className="rounded-lg bg-violet-50 p-2 shrink-0"><Video className="h-5 w-5 text-violet-600" /></div>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Nhân sự</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{data.summary.staffCount}</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-2 shrink-0"><Users className="h-5 w-5 text-orange-600" /></div>
              </div>
            </div>
          </div>

          {/* Staff breakdown bar chart */}
          {data.staffBreakdown.length > 0 && (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection("chart")}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50/50 transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-sm font-semibold text-zinc-900">Views theo nhân sự</h2>
                  {collapsed["chart"] && (
                    <p className="text-xs text-zinc-400 mt-0.5">Top 10 nhân sự</p>
                  )}
                </div>
                {collapsed["chart"] ? (
                  <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
              </button>
              {!collapsed["chart"] && (
                <div className="px-5 pb-5">
                  <p className="mb-4 text-xs text-zinc-400">Top 10 nhân sự</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.staffBreakdown.slice(0, 10).map((s) => ({
                        name: s.name.split(" ").slice(-1)[0],
                        fullName: s.name,
                        Views: s.views,
                      }))}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={45} />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => fmt(Number(v))}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? _}
                      />
                      <Bar dataKey="Views" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Top Videos Table */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("videos")}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50/50 transition-colors"
            >
              <h2 className="text-sm font-semibold text-zinc-900">
                {selectedChannel ? "Tất cả video trong kênh" : "Top video"}{" "}
                ({data.topVideos.length})
              </h2>
              <div className="flex items-center gap-3">
                {!collapsed["videos"] && data.mode === "channel" && (
                  <span className="text-xs text-zinc-400">Sắp xếp theo views giảm dần</span>
                )}
                {!collapsed["videos"] && data.topVideos.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportViewsXlsx(data.topVideos, data.dateRange.label.replace(/\s/g, "-"));
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export Excel
                  </button>
                )}
                {collapsed["videos"] ? (
                  <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
              </div>
            </button>

            {!collapsed["videos"] && (
              data.topVideos.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400 border-t">Chưa có video nào</p>
              ) : (
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-zinc-50">
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Tiêu đề</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Video ID</th>
                        {!selectedChannel && (
                          <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Kênh</th>
                        )}
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Nhân sự</th>
                        <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topVideos.map((v) => (
                        <tr key={v.videoId} className="border-b last:border-0 hover:bg-zinc-50/50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {v.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover bg-zinc-100" />
                              ) : (
                                <div className="h-10 w-16 shrink-0 rounded bg-zinc-100" />
                              )}
                              <p className="font-medium text-zinc-900 line-clamp-2 max-w-[280px]">
                                {v.title || <span className="text-zinc-400 italic">Chưa có tiêu đề</span>}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <VideoIdCell
                              videoId={v.videoId}
                              youtubeVideoId={v._youtubeVideoId ?? v.youtubeVideoId}
                              onUpdated={(newId) => {
                                setData((prev) =>
                                  prev ? {
                                    ...prev,
                                    topVideos: prev.topVideos.map((t) =>
                                      t.videoId === v.videoId ? { ...t, _youtubeVideoId: newId } : t
                                    ),
                                  } : prev
                                );
                              }}
                            />
                          </td>
                          {!selectedChannel && (
                            <td className="px-5 py-3 text-sm text-zinc-600">{v.channelName}</td>
                          )}
                          <td className="px-5 py-3">
                            {v.staff.length === 0 ? (
                              <span className="text-xs text-zinc-400">Chưa assign</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {v.staff.slice(0, 2).map((s, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                      s.role === "WRITER" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                                    }`}
                                  >
                                    {s.name.split(" ").slice(-1)[0]}
                                  </span>
                                ))}
                                {v.staff.length > 2 && (
                                  <span className="text-xs text-zinc-400">+{v.staff.length - 2}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-zinc-900">
                            {fmt(v.metrics.views)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>


        </>
      )}

      {/* Local team manager — nằm ngoài block loading để không bị unmount khi đổi filter */}
      {selectedChannel && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <button
              type="button"
              onClick={() => toggleSection("teamManager")}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <h2 className="text-sm font-semibold text-zinc-900">View Tracker</h2>
              {collapsed["teamManager"] ? (
                <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
              )}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {data && (data.lastSyncedAt ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <Clock className="h-3 w-3 shrink-0" />
                  Cập nhật{" "}
                  {new Date(data.lastSyncedAt).toLocaleString("vi-VN", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-xs text-zinc-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  Chưa có dữ liệu
                </span>
              ))}
              {!loading && data && data.topVideos.length > 0 && !collapsed["teamManager"] && (
                <SampleExportPanel
                  videos={data.topVideos.map((v) => ({
                    youtubeVideoId: v._youtubeVideoId ?? v.youtubeVideoId,
                    title: v.title,
                  }))}
                  channelId={selectedChannel}
                />
              )}
            </div>
          </div>
          {!collapsed["teamManager"] && (
            <div className="border-t px-5 py-4">
              <LocalTeamManager
                channelId={selectedChannel}
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Default export: wraps in Suspense (required for useSearchParams) ─────────

export default function DirectorAnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center gap-2 py-24 text-zinc-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Đang tải...</span>
      </div>
    }>
      <DirectorAnalyticsContent />
    </Suspense>
  );
}
