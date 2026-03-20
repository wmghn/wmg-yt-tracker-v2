"use client";

import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { TeamMemberRow } from "@/app/api/analytics/team-analytics/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("vi-VN");
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-rose-100 text-rose-700",
  "bg-yellow-100 text-yellow-700",
  "bg-teal-100 text-teal-700",
];

// Map userId → color index (stable across renders)
const colorCache = new Map<string, number>();
let colorIndex = 0;
function getAvatarColor(userId: string): string {
  if (!colorCache.has(userId)) {
    colorCache.set(userId, colorIndex % AVATAR_COLORS.length);
    colorIndex++;
  }
  return AVATAR_COLORS[colorCache.get(userId)!];
}

// ─── Avatar circle ────────────────────────────────────────────────────────────

function Avatar({ userId, name, size = "md" }: { userId: string; name: string; size?: "sm" | "md" | "lg" }) {
  const color = getAvatarColor(userId);
  const sizeClass = size === "sm"
    ? "h-7 w-7 text-xs"
    : size === "lg"
    ? "h-12 w-12 text-base"
    : "h-9 w-9 text-sm";
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${color} ${sizeClass}`}>
      {initials(name)}
    </div>
  );
}

// ─── Single member section ────────────────────────────────────────────────────

function MemberSection({ member }: { member: TeamMemberRow }) {
  const [expanded, setExpanded] = useState(true);

  const roleLabel = member.primaryRole === "WRITER" ? "Content" : member.primaryRole === "EDITOR" ? "Editor" : null;
  const roleBadgeClass =
    member.primaryRole === "WRITER"
      ? "border-blue-300 text-blue-700 bg-blue-50"
      : member.primaryRole === "EDITOR"
      ? "border-purple-300 text-purple-700 bg-purple-50"
      : "border-zinc-200 text-zinc-500 bg-zinc-50";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      {/* Member header */}
      <button
        type="button"
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <Avatar userId={member.userId} name={member.name} size="lg" />

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-zinc-900 text-base">{member.name}</span>
            {roleLabel && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass}`}>
                {roleLabel}
                {member.weightPercent !== null && ` · ${member.weightPercent}%`}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{member.videoCount} videos</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">
              {member.totalViewsReceived.toLocaleString("vi-VN")}
            </p>
            <p className="text-xs text-zinc-400">views nhận được</p>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </button>

      {/* Video table */}
      {expanded && member.videos.length > 0 && (
        <div className="border-t border-zinc-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Tiêu đề video
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Video ID
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Tổng Views
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Người làm
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
              {member.videos.map((v) => (
                <tr key={v.videoId} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40">
                  {/* Title */}
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-900 line-clamp-2 max-w-[260px] text-sm">
                      {v.title || <span className="text-zinc-400 italic">Chưa có tiêu đề</span>}
                    </p>
                  </td>

                  {/* Video ID */}
                  <td className="px-4 py-3">
                    <a
                      href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      {v.youtubeVideoId}
                    </a>
                  </td>

                  {/* Total views */}
                  <td className="px-4 py-3 text-right font-semibold text-zinc-800 whitespace-nowrap">
                    {v.totalViews.toLocaleString("vi-VN")}
                  </td>

                  {/* Coworkers */}
                  <td className="px-4 py-3">
                    <div className="flex items-center -space-x-1.5">
                      {v.coworkers.slice(0, 5).map((c) => (
                        <div
                          key={`${c.userId}-${c.role}`}
                          title={`${c.name} (${c.role === "WRITER" ? "Content" : "Editor"})`}
                        >
                          <Avatar userId={c.userId} name={c.name} size="sm" />
                        </div>
                      ))}
                      {v.coworkers.length > 5 && (
                        <span className="h-7 w-7 rounded-full bg-zinc-100 border border-white flex items-center justify-center text-xs text-zinc-500 font-medium">
                          +{v.coworkers.length - 5}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Formula */}
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {v.formula.split("\n").map((line, i) => (
                        <p key={i} className="text-xs text-zinc-500 whitespace-nowrap">
                          {line}
                        </p>
                      ))}
                    </div>
                  </td>

                  {/* Views received */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-base font-bold text-blue-600 whitespace-nowrap">
                      {v.viewsReceived.toLocaleString("vi-VN")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  channelId: string;
}

export function TeamMemberSection({ channelId }: Props) {
  const [data, setData] = useState<TeamMemberRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/analytics/team-analytics?channelId=${channelId}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải dữ liệu");
        return r.json();
      })
      .then((json) => setData(json.members ?? []))
      .catch((e: Error) => setError(e.message ?? "Lỗi"))
      .finally(() => setLoading(false));
  }, [channelId]);

  if (!channelId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
        <span className="text-sm">Đang tải phân tích nhân sự...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        Chưa có dữ liệu phân tích nhân sự — vào tab Thành viên để thêm video cho từng thành viên
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((member) => (
        <MemberSection key={member.userId} member={member} />
      ))}
    </div>
  );
}
