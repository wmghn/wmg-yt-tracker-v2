"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BarChart3, Eye, Clock, RefreshCw } from "lucide-react";
import { ChannelDropdown } from "@/components/analytics/channel-dropdown";
import { StaffVideoTracker } from "@/components/analytics/staff-video-tracker";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("vi-VN");
}

// ─── Inner Content ─────────────────────────────────────────────────────────────

function StaffAnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [channelId, setChannelId] = useState<string>(searchParams.get("channelId") ?? "");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function pushUrl(cid: string) {
    const p = new URLSearchParams();
    if (cid) p.set("channelId", cid);
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const fetchSummary = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateRange: "28days" });
      if (cid) params.set("channelId", cid);
      const res = await fetch(`/api/analytics/staff-analytics?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Lỗi tải dữ liệu");
      const json = await res.json();
      setSummary(json.summary);
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
    fetch("/api/analytics/staff-analytics?dateRange=28days")
      .then((r) => r.json())
      .then((json) => {
        const list: Channel[] = json.channels ?? [];
        setChannels(list);
        const urlCid = searchParams.get("channelId") ?? "";
        const cid = urlCid || list[0]?.id || "";
        if (!urlCid && cid) {
          setChannelId(cid);
          pushUrl(cid);
        }
        fetchSummary(cid);
      })
      .catch(() => fetchSummary(searchParams.get("channelId") ?? ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChannelChange(cid: string) {
    setChannelId(cid);
    pushUrl(cid);
    fetchSummary(cid);
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
          {channels.length > 0 && (
            <ChannelDropdown
              channels={channels}
              value={channelId}
              onChange={handleChannelChange}
            />
          )}

          {syncLabel ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Cập nhật lúc {syncLabel}
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

      {!loading && !error && summary && (
        <>
          {/* KPI Cards — personal summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Views của bạn</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{fmt(summary.views)}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">Tổng tích lũy</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 shrink-0">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Views quy đổi</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(summary.weightedViews)}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">Theo tỷ lệ vai trò</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 shrink-0">
                  <Eye className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Video của bạn</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{summary.videoCount}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">Đã khai báo</p>
                </div>
                <div className="rounded-lg bg-violet-50 p-2 shrink-0">
                  <Eye className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Staff video tracker */}
          {channelId && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">Video IDs của bạn</h2>
              <StaffVideoTracker channelId={channelId} />
            </div>
          )}
        </>
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
