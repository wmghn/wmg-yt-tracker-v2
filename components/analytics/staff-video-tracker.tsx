"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, RefreshCw } from "lucide-react";
import { DateRangeDropdown, type DateRangeValue } from "@/components/analytics/date-range-dropdown";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VideoViewData {
  youtubeVideoId: string;
  title: string;
  viewsCount: number;
}

interface WeightConfig {
  role: string;
  weightPercent: number;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function storageKey(channelId: string): string {
  return `staff-video-ids-v1-${channelId}`;
}

interface SavedData {
  role: "WRITER" | "EDITOR";
  videoIds: string[];
}

function loadData(channelId: string): SavedData {
  try {
    const raw = localStorage.getItem(storageKey(channelId));
    if (!raw) return { role: "WRITER", videoIds: [] };
    return JSON.parse(raw) as SavedData;
  } catch {
    return { role: "WRITER", videoIds: [] };
  }
}

function saveData(channelId: string, data: SavedData): void {
  try {
    localStorage.setItem(storageKey(channelId), JSON.stringify(data));
  } catch { /* non-fatal */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("vi-VN");
}

function extractVideoId(raw: string): string | null {
  const s = raw.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/shorts\/([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

function parseIds(text: string): string[] {
  return Array.from(new Set(
    text.split("\n").map(extractVideoId).filter((id): id is string => id !== null)
  ));
}

const DEFAULT_DATE_RANGE: DateRangeValue = { type: "28days", label: "28 ngày qua" };

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  channelId: string;
}

export function StaffVideoTracker({ channelId }: Props) {
  const [role, setRole] = useState<"WRITER" | "EDITOR">("WRITER");
  const [idsText, setIdsText] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [viewMap, setViewMap] = useState<Map<string, VideoViewData>>(new Map());
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage whenever channelId changes
  useEffect(() => {
    if (!channelId) return;
    const saved = loadData(channelId);
    setRole(saved.role);
    setIdsText(saved.videoIds.join("\n"));
    setViewMap(new Map());
  }, [channelId]);

  // Load channel weight config
  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/channels/${channelId}/weights`)
      .then((r) => r.json())
      .then((configs: WeightConfig[]) => {
        const map: Record<string, number> = {};
        for (const c of configs) map[c.role] = Number(c.weightPercent);
        setWeights(map);
      })
      .catch(() => {});
  }, [channelId]);

  // Fetch views from DB whenever ids or dateRange change
  const fetchViews = useCallback((ids: string[], dr: DateRangeValue) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    if (ids.length === 0) { setViewMap(new Map()); return; }

    fetchTimer.current = setTimeout(async () => {
      setFetching(true);
      try {
        const params = new URLSearchParams({ ids: ids.join(","), dateRange: dr.type });
        if (dr.month) params.set("month", String(dr.month));
        if (dr.year) params.set("year", String(dr.year));
        const res = await fetch(`/api/videos/views-lookup?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        const map = new Map<string, VideoViewData>();
        for (const v of json.videos ?? []) map.set(v.youtubeVideoId, v);
        setViewMap(map);
      } catch { /* non-fatal */ } finally {
        setFetching(false);
      }
    }, 400);
  }, []);

  const parsedIds = parseIds(idsText);

  useEffect(() => {
    fetchViews(parsedIds, dateRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsText, dateRange, fetchViews]);

  function handleIdsChange(text: string) {
    setIdsText(text);
    saveData(channelId, { role, videoIds: parseIds(text) });
  }

  function handleRoleChange(r: "WRITER" | "EDITOR") {
    setRole(r);
    saveData(channelId, { role: r, videoIds: parsedIds });
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      handleIdsChange(idsText.trim() ? idsText + "\n" + content : content);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const roleWeight = weights[role] ?? (role === "WRITER" ? 40 : 60);
  const hasViews = viewMap.size > 0;

  const videos = parsedIds
    .map((ytId) => {
      const data = viewMap.get(ytId);
      const totalViews = data?.viewsCount ?? 0;
      const viewsReceived = Math.round((totalViews * roleWeight) / 100);
      return { youtubeVideoId: ytId, title: data?.title ?? "", totalViews, viewsReceived };
    })
    .sort((a, b) => b.viewsReceived - a.viewsReceived);

  const totalViews = videos.reduce((s, v) => s + v.totalViews, 0);
  const totalViewsReceived = videos.reduce((s, v) => s + v.viewsReceived, 0);

  return (
    <div className="space-y-4">
      {/* Date range + loading indicator */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeDropdown value={dateRange} onChange={setDateRange} />
        {fetching && <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />}
      </div>

      {/* Role selector */}
      <div className="flex gap-2">
        {(["WRITER", "EDITOR"] as const).map((r) => {
          const label = r === "WRITER" ? "Content" : "Editor";
          const w = weights[r];
          const active = role === r;
          const activeClass =
            r === "WRITER"
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-purple-400 bg-purple-50 text-purple-700";
          return (
            <button
              key={r}
              type="button"
              onClick={() => handleRoleChange(r)}
              className={`flex-1 rounded-lg border py-2 px-3 text-sm font-medium transition-colors ${
                active ? activeClass : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {label}
              {w !== undefined && (
                <span className={`ml-1.5 text-xs font-semibold ${active ? "" : "text-zinc-400"}`}>
                  {w}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Video IDs input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">
            Video IDs <span className="font-normal text-zinc-400">(mỗi ID 1 dòng)</span>
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleUpload} />
        </div>
        <textarea
          value={idsText}
          onChange={(e) => handleIdsChange(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
          placeholder={"6gVNYQTIWK0\nDrKUYV0eqTs\nnHZ-0ceWkm8"}
        />
        {parsedIds.length > 0 && (
          <p className="text-xs text-zinc-400">{parsedIds.length} video ID hợp lệ</p>
        )}
      </div>

      {/* Summary cards */}
      {hasViews && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Tổng Views</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{fmt(totalViews)}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Views nhận ({roleWeight}%)
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{fmt(totalViewsReceived)}</p>
          </div>
        </div>
      )}

      {/* Video table */}
      {hasViews && videos.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Tiêu đề / Video ID
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Tổng Views
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Công thức
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Views nhận
                </th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.youtubeVideoId} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-900 line-clamp-2 max-w-[260px] text-sm">
                      {v.title || <span className="text-zinc-400 italic">Chưa có tiêu đề</span>}
                    </p>
                    <a
                      href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {v.youtubeVideoId}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-800 whitespace-nowrap">
                    {v.totalViews.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-zinc-500 whitespace-nowrap">
                      {v.totalViews.toLocaleString("vi-VN")} × {roleWeight}% = {v.viewsReceived.toLocaleString("vi-VN")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-base font-bold text-blue-600 whitespace-nowrap">
                      {fmt(v.viewsReceived)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parsedIds.length > 0 && !hasViews && !fetching && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-400">
          Chưa có dữ liệu views — Admin cần sync dữ liệu từ YouTube trước
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Dữ liệu lưu tại trình duyệt — chỉ hiển thị trên thiết bị này
      </p>
    </div>
  );
}
