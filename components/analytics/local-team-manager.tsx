"use client";

import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import {
  Upload, Pencil, Trash2, Plus, ChevronUp, ChevronDown, RefreshCw, X,
  FileSpreadsheet, BarChart3, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeDropdown, type DateRangeValue } from "@/components/analytics/date-range-dropdown";
import * as XLSX from "xlsx";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LocalPerson {
  id: string;
  name: string;
  role: "WRITER" | "EDITOR";
  videoIds: string[];
}

interface VideoViewData {
  youtubeVideoId: string;
  title: string;
  viewsCount: number;
}

interface WeightConfig {
  role: string;
  weightPercent: number;
}

interface PersonVideoRow {
  youtubeVideoId: string;
  title: string;
  totalViews: number;
  sameRoleCount: number;
  roleWeight: number;
  viewsReceived: number;
}

interface PersonSummaryRow {
  person: LocalPerson;
  totalViewsReceived: number;
  videos: PersonVideoRow[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ─── Local storage helpers ──────────────────────────────────────────────────────

function storageKey(channelId: string): string {
  return `local-team-v1-${channelId}`;
}

function loadPersons(channelId: string): LocalPerson[] {
  try {
    const raw = localStorage.getItem(storageKey(channelId));
    if (!raw) return [];
    return JSON.parse(raw) as LocalPerson[];
  } catch {
    return [];
  }
}

function savePersons(channelId: string, persons: LocalPerson[]): void {
  try {
    localStorage.setItem(storageKey(channelId), JSON.stringify(persons));
  } catch { /* non-fatal */ }
}

// ─── XLSX import helpers ────────────────────────────────────────────────────────

/**
 * Parse an xlsx workbook where:
 *   Col A = Tên nhân sự
 *   Col B = Vai trò  ("content" / "editor", case-insensitive)
 *   Col C = Số video (ignored)
 *   Col D = Video IDs (space/newline-separated)
 * Row 1 is the header — skipped.
 */
function parseXlsx(buffer: ArrayBuffer): LocalPerson[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];

  const persons: LocalPerson[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[0] ?? "").trim();
    const rawRole = String(row[1] ?? "").trim().toLowerCase();
    const rawIds = String(row[3] ?? "").trim();
    if (!name || !rawIds) continue;

    const role: "WRITER" | "EDITOR" =
      rawRole.includes("content") ? "WRITER" :
      rawRole.includes("editor") ? "EDITOR" :
      "WRITER";

    const videoIds = Array.from(new Set(
      rawIds.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{11}$/.test(s))
    ));
    if (videoIds.length === 0) continue;

    persons.push({ id: genId(), name, role, videoIds });
  }
  return persons;
}

// ─── Import drop zone ───────────────────────────────────────────────────────────

function ImportZone({ onImport }: { onImport: (persons: LocalPerson[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const persons = parseXlsx(buffer);
      if (persons.length === 0) {
        setImportResult("❌ Không tìm thấy dữ liệu hợp lệ trong file");
        return;
      }
      onImport(persons);
      setImportResult(`✓ Đã import ${persons.length} nhân sự`);
    } catch {
      setImportResult("❌ Không đọc được file — kiểm tra định dạng .xlsx");
    } finally {
      setImporting(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    processFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-1.5">
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 cursor-pointer transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-zinc-300 bg-white hover:border-blue-300 hover:bg-blue-50/40"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {importing ? (
          <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
        ) : (
          <Upload className="h-4 w-4 text-zinc-400 shrink-0" />
        )}
        <span className="text-sm text-zinc-500">
          Import từ file Lọc Video ID{" "}
          <span className="font-medium text-zinc-700">(.xlsx)</span>{" "}
          — hoặc kéo thả vào đây
        </span>
        <FileSpreadsheet className="h-4 w-4 text-zinc-300 ml-auto shrink-0" />
      </div>
      {importResult && (
        <p className={`text-xs px-1 ${importResult.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
          {importResult}
        </p>
      )}
    </div>
  );
}

// ─── Analytics calculation ──────────────────────────────────────────────────────

function computeSummaries(
  persons: LocalPerson[],
  viewMap: Map<string, VideoViewData>,
  weights: Record<string, number>,
): PersonSummaryRow[] {
  const videoRoleCounts = new Map<string, number>();

  for (const p of persons) {
    for (const vid of p.videoIds) {
      const key = `${vid}:${p.role}`;
      videoRoleCounts.set(key, (videoRoleCounts.get(key) ?? 0) + 1);
    }
  }

  return persons.map((p) => {
    const roleWeight = weights[p.role] ?? (p.role === "WRITER" ? 40 : 60);
    let totalViewsReceived = 0;

    const videos: PersonVideoRow[] = p.videoIds
      .map((ytId) => {
        const data = viewMap.get(ytId);
        const totalViews = data?.viewsCount ?? 0;
        const sameRoleCount = videoRoleCounts.get(`${ytId}:${p.role}`) ?? 1;
        const viewsReceived = Math.round((totalViews * roleWeight) / 100 / sameRoleCount);
        totalViewsReceived += viewsReceived;
        return {
          youtubeVideoId: ytId,
          title: data?.title ?? ytId,
          totalViews,
          sameRoleCount,
          roleWeight,
          viewsReceived,
        };
      })
      .sort((a, b) => b.viewsReceived - a.viewsReceived);

    return { person: p, totalViewsReceived: Math.round(totalViewsReceived), videos };
  });
}

// ─── Person card ───────────────────────────────────────────────────────────────

function PersonCard({
  person,
  index,
  weights,
  onEdit,
  onDelete,
}: {
  person: LocalPerson;
  index: number;
  weights: Record<string, number>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = avatarColor(index);
  const roleLabel = person.role === "WRITER" ? "Content" : "Editor";
  const roleWeight = weights[person.role];
  const roleBadgeClass =
    person.role === "WRITER"
      ? "border-blue-300 bg-blue-50 text-blue-700"
      : "border-purple-300 bg-purple-50 text-purple-700";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm p-4 flex items-start gap-3">
      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${color}`}>
        {initials(person.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-zinc-900 text-sm">{person.name}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadgeClass}`}>
            {roleLabel}{roleWeight !== undefined ? ` · ${roleWeight}%` : ""}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">{person.videoIds.length} video</p>
        {person.videoIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {person.videoIds.slice(0, 6).map((id) => (
              <span key={id} className="font-mono text-xs bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5">
                {id}
              </span>
            ))}
            {person.videoIds.length > 6 && (
              <span className="text-xs text-zinc-400 px-1">+{person.videoIds.length - 6} nữa</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Sửa"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Xoá"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Person form ───────────────────────────────────────────────────────────────

function PersonForm({
  initial,
  weights,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: LocalPerson;
  weights: Record<string, number>;
  onSubmit: (name: string, role: "WRITER" | "EDITOR", videoIds: string[]) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<"WRITER" | "EDITOR">(initial?.role ?? "EDITOR");
  const [idsText, setIdsText] = useState(initial?.videoIds.join("\n") ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setIdsText((prev) => (prev.trim() ? prev + "\n" + content : content));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const videoIds = parseIds(idsText);
    onSubmit(trimmedName, role, videoIds);
  }

  const writerWeight = weights["WRITER"];
  const editorWeight = weights["EDITOR"];

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-700">
        {initial ? "Sửa nhân sự" : "Thêm nhân sự mới"}
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên nhân sự"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />

      <div className="flex gap-2">
        {(["EDITOR", "WRITER"] as const).map((r) => {
          const label = r === "WRITER" ? "Content" : "Editor";
          const w = r === "WRITER" ? writerWeight : editorWeight;
          const active = role === r;
          const activeClass =
            r === "WRITER"
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-purple-400 bg-purple-50 text-purple-700";
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 rounded-lg border py-2 px-3 text-sm font-medium transition-colors ${
                active ? activeClass : "border-zinc-200 text-zinc-500 hover:bg-zinc-100"
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-600">
            Video IDs <span className="font-normal text-zinc-400">(mỗi ID 1 dòng)</span>
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Upload className="h-3 w-3" />
            Upload .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleUpload} />
        </div>
        <textarea
          value={idsText}
          onChange={(e) => setIdsText(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
          placeholder={"6gVNYQTIWK0\nDrKUYV0eqTs\nnHZ-0ceWkm8"}
        />
        {parseIds(idsText).length > 0 && (
          <p className="text-xs text-zinc-400">{parseIds(idsText).length} video ID hợp lệ</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={!name.trim()} className="flex-1" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Analytics section ─────────────────────────────────────────────────────────

function AnalyticsSection({ summaries }: { summaries: PersonSummaryRow[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        Chưa có nhân sự nào — thêm nhân sự ở tab Quản lý
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summaries.map((row, idx) => {
        const expanded = expandedIds.has(row.person.id);
        const color = avatarColor(idx);
        const roleLabel = row.person.role === "WRITER" ? "Content" : "Editor";
        const roleBadgeClass =
          row.person.role === "WRITER"
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-purple-300 bg-purple-50 text-purple-700";

        return (
          <div key={row.person.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 transition-colors"
              onClick={() => toggle(row.person.id)}
            >
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${color}`}>
                {initials(row.person.name)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-zinc-900 text-sm">{row.person.name}</span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass}`}>
                    {roleLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{row.videos.length} videos</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-600">{fmt(row.totalViewsReceived)}</p>
                  <p className="text-xs text-zinc-400">views nhận được</p>
                </div>
                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </button>

            {expanded && row.videos.length > 0 && (
              <div className="border-t border-zinc-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-100">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tiêu đề / Video ID</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tổng Views</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Công thức</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">Views nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.videos.map((v) => (
                      <tr key={v.youtubeVideoId} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40">
                        <td className="px-5 py-3">
                          <p className="font-medium text-zinc-900 line-clamp-2 max-w-[260px] text-sm">
                            {v.title !== v.youtubeVideoId
                              ? v.title
                              : <span className="text-zinc-400 italic">Chưa có tiêu đề</span>}
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
                            {v.totalViews.toLocaleString("vi-VN")} → ×{v.roleWeight}% →{" "}
                            {Math.round(v.totalViews * v.roleWeight / 100).toLocaleString("vi-VN")} → ÷{v.sameRoleCount} → ={" "}
                            {v.viewsReceived.toLocaleString("vi-VN")} views
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
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

const DEFAULT_DATE_RANGE: DateRangeValue = { type: "28days", label: "28 ngày qua" };

interface Props {
  channelId: string;
}

export function LocalTeamManager({ channelId }: Props) {
  const [activeTab, setActiveTab] = useState<"manage" | "analytics">("manage");
  const [persons, setPersons] = useState<LocalPerson[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [viewMap, setViewMap] = useState<Map<string, VideoViewData>>(new Map());
  const [fetchingViews, setFetchingViews] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage whenever channelId changes
  useEffect(() => {
    if (!channelId) return;
    setPersons(loadPersons(channelId));
    setViewMap(new Map());
    setEditingId(null);
    setShowAddForm(false);
  }, [channelId]);

  // Load weight config
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

  // Fetch view counts whenever persons or dateRange changes
  const fetchViews = useCallback((ps: LocalPerson[], dr: DateRangeValue) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    const allIds = Array.from(new Set(ps.flatMap((p) => p.videoIds)));
    if (allIds.length === 0) { setViewMap(new Map()); return; }

    fetchTimer.current = setTimeout(async () => {
      setFetchingViews(true);
      try {
        const params = new URLSearchParams({ ids: allIds.join(","), dateRange: dr.type });
        if (dr.month) params.set("month", String(dr.month));
        if (dr.year)  params.set("year",  String(dr.year));
        const res = await fetch(`/api/videos/views-lookup?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        const map = new Map<string, VideoViewData>();
        for (const v of json.videos ?? []) map.set(v.youtubeVideoId, v);
        setViewMap(map);
      } catch { /* non-fatal */ } finally {
        setFetchingViews(false);
      }
    }, 400);
  }, []);

  useEffect(() => {
    fetchViews(persons, dateRange);
  }, [persons, dateRange, fetchViews]);

  function persist(updated: LocalPerson[]) {
    setPersons(updated);
    savePersons(channelId, updated);
  }

  function handleAdd(name: string, role: "WRITER" | "EDITOR", videoIds: string[]) {
    persist([...persons, { id: genId(), name, role, videoIds }]);
    setShowAddForm(false);
  }

  function handleEdit(id: string, name: string, role: "WRITER" | "EDITOR", videoIds: string[]) {
    persist(persons.map((p) => (p.id === id ? { ...p, name, role, videoIds } : p)));
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Xoá nhân sự này?")) return;
    persist(persons.filter((p) => p.id !== id));
  }

  function handleImport(imported: LocalPerson[]) {
    const merged = [...persons];
    for (const imp of imported) {
      const existIdx = merged.findIndex(
        (p) => p.name.toLowerCase() === imp.name.toLowerCase()
      );
      if (existIdx >= 0) {
        merged[existIdx] = { ...merged[existIdx], ...imp };
      } else {
        merged.push(imp);
      }
    }
    persist(merged);
    // Switch to analytics tab after import
    setActiveTab("analytics");
  }

  const summaries = computeSummaries(persons, viewMap, weights);

  return (
    <div className="space-y-4">
      {/* Tab bar + analytics CTA */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("manage")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "manage"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Quản lý
            {persons.length > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === "manage" ? "bg-zinc-100 text-zinc-600" : "bg-zinc-200 text-zinc-500"
              }`}>
                {persons.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "analytics"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Phân tích
          </button>
        </div>

        {activeTab === "manage" && (
          <Button
            onClick={() => setActiveTab("analytics")}
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Xem phân tích views
          </Button>
        )}
      </div>

      {/* ── Manage tab ── */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          {/* Import zone */}
          <ImportZone onImport={handleImport} />

          {/* Person cards */}
          {persons.length > 0 && (
            <div className="space-y-2">
              {persons.map((p, idx) =>
                editingId === p.id ? (
                  <PersonForm
                    key={p.id}
                    initial={p}
                    weights={weights}
                    submitLabel="Lưu thay đổi"
                    onSubmit={(name, role, videoIds) => handleEdit(p.id, name, role, videoIds)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <PersonCard
                    key={p.id}
                    person={p}
                    index={idx}
                    weights={weights}
                    onEdit={() => { setEditingId(p.id); setShowAddForm(false); }}
                    onDelete={() => handleDelete(p.id)}
                  />
                )
              )}
            </div>
          )}

          {/* Add form or add button */}
          {showAddForm ? (
            <PersonForm
              weights={weights}
              submitLabel="Thêm nhân sự"
              onSubmit={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditingId(null); }}
              className="w-full rounded-xl border-2 border-dashed border-zinc-200 py-4 text-sm font-medium text-zinc-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Thêm nhân sự mới
            </button>
          )}

          <p className="text-xs text-zinc-400 text-center">
            Dữ liệu lưu tại trình duyệt — chỉ hiển thị với tài khoản đang đăng nhập trên thiết bị này
          </p>
        </div>
      )}

      {/* ── Analytics tab ── */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          {/* Date range filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {fetchingViews && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang tải...
                </span>
              )}
            </div>
            <DateRangeDropdown value={dateRange} onChange={setDateRange} />
          </div>

          <AnalyticsSection summaries={summaries} />
        </div>
      )}
    </div>
  );
}
