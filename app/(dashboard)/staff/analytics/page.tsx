"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BarChart3, Eye, Video, Clock, RefreshCw } from "lucide-react";
import { ChannelDropdown } from "@/components/analytics/channel-dropdown";
import { LocalTeamManager } from "@/components/analytics/local-team-manager";
import { DateRangeDropdown, type DateRangeValue } from "@/components/analytics/date-range-dropdown";
import { resolveDateRange, type DateRangeType } from "@/lib/youtube/analytics-api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
}

interface StaffSummary {
  views: number;
  weightedViews: number;
  videoCount: number;
}

interface PersonOption {
  id: string;
  name: string;
  role: string;
}

interface PersonSummaryRow {
  person: { id: string; name: string; role: string };
  totalViewsReceived: number;
  videos: { viewsReceived: number; youtubeVideoId: string }[];
}

function myPersonStorageKey(channelId: string) {
  return `my-person-v1-${channelId}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("vi-VN");
}

// ─── Inner Content ─────────────────────────────────────────────────────────────

function parseDateRange(params: URLSearchParams): DateRangeValue {
  const type = (params.get("dateRange") ?? "28days") as DateRangeType;
  const month = params.get("month") ? Number(params.get("month")) : undefined;
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const { label } = resolveDateRange(type, month, year);
  return { type, month, year, label };
}

function StaffAnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [channelId, setChannelId] = useState<string>(searchParams.get("channelId") ?? "");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [channelTotalViews, setChannelTotalViews] = useState<number | null>(null);
  const [channelVideoCount, setChannelVideoCount] = useState<number | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => parseDateRange(searchParams));
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [myPersonId, setMyPersonId] = useState<string>("");
  const [summaries, setSummaries] = useState<PersonSummaryRow[]>([]);

  function pushUrl(cid: string, dr: DateRangeValue) {
    const p = new URLSearchParams();
    if (cid) p.set("channelId", cid);
    p.set("dateRange", dr.type);
    if (dr.month) p.set("month", String(dr.month));
    if (dr.year) p.set("year", String(dr.year));
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const fetchSummary = useCallback(async (cid: string, dr: DateRangeValue) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateRange: dr.type });
      if (cid) params.set("channelId", cid);
      if (dr.month) params.set("month", String(dr.month));
      if (dr.year) params.set("year", String(dr.year));
      const res = await fetch(`/api/analytics/staff-analytics?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Lỗi tải dữ liệu");
      const json = await res.json();
      setSummary(json.summary);
      setChannelTotalViews(json.channelTotalViews ?? null);
      setChannelVideoCount(json.channelVideoCount ?? null);
      setSyncLabel(
        json.lastSyncedAt
          ? new Date(json.lastSyncedAt).toLocaleString("vi-VN", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })
          : null
      );
      if (json.channels?.length > 0) setChannels(json.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load channels list + auto-select first
  useEffect(() => {
    const initDr = parseDateRange(searchParams);
    fetch(`/api/analytics/staff-analytics?dateRange=${initDr.type}`)
      .then((r) => r.json())
      .then((json) => {
        const list: Channel[] = json.channels ?? [];
        setChannels(list);
        const urlCid = searchParams.get("channelId") ?? "";
        const cid = urlCid || list[0]?.id || "";
        if (!urlCid && cid) {
          setChannelId(cid);
          pushUrl(cid, initDr);
        }
        fetchSummary(cid, initDr);
      })
      .catch(() => fetchSummary(searchParams.get("channelId") ?? "", parseDateRange(searchParams)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load myPersonId from localStorage when channelId changes
  useEffect(() => {
    if (!channelId) return;
    const saved = localStorage.getItem(myPersonStorageKey(channelId)) ?? "";
    setMyPersonId(saved);
  }, [channelId]);

  function handleMyPersonChange(id: string) {
    setMyPersonId(id);
    if (channelId) localStorage.setItem(myPersonStorageKey(channelId), id);
  }

  function handleChannelChange(cid: string) {
    setChannelId(cid);
    pushUrl(cid, dateRange);
    fetchSummary(cid, dateRange);
  }

  function handleDateRangeChange(dr: DateRangeValue) {
    setDateRange(dr);
    pushUrl(channelId, dr);
    fetchSummary(channelId, dr);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Analytics</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DateRangeDropdown value={dateRange} onChange={handleDateRangeChange} />

          {channels.length > 1 && (
            <ChannelDropdown
              channels={channels}
              value={channelId}
              onChange={handleChannelChange}
            />
          )}

          {syncLabel ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Dữ liệu cập nhật lúc {syncLabel}
            </span>
          ) : !loading && (
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Chưa có dữ liệu
            </span>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Tổng Views</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">
                  {channelTotalViews !== null ? fmt(channelTotalViews) : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 shrink-0">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Video</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">
                  {channelVideoCount !== null ? channelVideoCount : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 p-2 shrink-0">
                <Video className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team manager — nằm ngoài block loading để không bị unmount khi đổi filter */}
      {channelId && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">View Tracker</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Nhập video IDs của <span className="font-medium text-zinc-600">tất cả thành viên trong nhóm</span> để tính đúng số views quy đổi.
              </p>
            </div>
            {!loading && (syncLabel ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700 shrink-0">
                <Clock className="h-3 w-3 shrink-0" />
                Cập nhật {syncLabel}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-xs text-zinc-400 shrink-0">
                <Clock className="h-3 w-3 shrink-0" />
                Chưa có dữ liệu
              </span>
            ))}
          </div>
          <div className="border-t px-5 py-4">
            <LocalTeamManager
              channelId={channelId}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              myPersonId={myPersonId}
              onSummariesChange={(s) => setSummaries(s as PersonSummaryRow[])}
              onPersonsChange={setPersons}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function StaffAnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center gap-2 py-24 text-zinc-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Đang tải...</span>
      </div>
    }>
      <StaffAnalyticsContent />
    </Suspense>
  );
}
