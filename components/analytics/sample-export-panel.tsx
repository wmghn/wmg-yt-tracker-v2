"use client";

import { useState } from "react";
import { Plus, Trash2, Download, X, Settings2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VideoItem {
  youtubeVideoId: string;
  title: string;
}

interface StaffEntry {
  id: string;
  name: string;
  role: "WRITER" | "EDITOR";
}

/** Một nhóm phân chia: X% video đầu → Y editors/video */
interface Tier {
  id: string;
  percent: number;
  editorsPerVideo: number;
}

interface Props {
  videos: VideoItem[];
  channelId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Phân chia video theo nhóm % (tiers):
 * - Content (WRITER): chia đều tất cả video (round-robin).
 * - Editor (EDITOR): mỗi nhóm % video → gán Y editors/video (round-robin cursor liên tiếp).
 *   → cùng video có thể có ở nhiều editor VÀ ở content writer.
 *
 * Ví dụ tiers: [{ percent:10, editorsPerVideo:2 }, { percent:90, editorsPerVideo:1 }]
 * → 10% video đầu: 2 editors/video, 90% còn lại: 1 editor/video.
 */
function buildAssignment(
  videoIds: string[],
  staff: StaffEntry[],
  tiers: Tier[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of staff) map.set(s.id, []);

  const writers = staff.filter((s) => s.role === "WRITER");
  const editors = staff.filter((s) => s.role === "EDITOR");
  const total = videoIds.length;

  // Writers: round-robin toàn bộ video
  videoIds.forEach((vid, i) => {
    if (writers.length === 0) return;
    map.get(writers[i % writers.length].id)!.push(vid);
  });

  // Editors: chia theo tiers
  if (editors.length > 0 && tiers.length > 0) {
    let videoStart = 0;
    let editorCursor = 0;

    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t];
      // Nhóm cuối lấy phần còn lại để tránh lệch do làm tròn
      const sliceCount =
        t === tiers.length - 1
          ? total - videoStart
          : Math.round((tier.percent / 100) * total);

      const slice = videoIds.slice(videoStart, videoStart + sliceCount);
      videoStart += sliceCount;

      const epv = Math.min(tier.editorsPerVideo, editors.length);
      for (const vid of slice) {
        for (let j = 0; j < epv; j++) {
          const editor = editors[(editorCursor + j) % editors.length];
          map.get(editor.id)!.push(vid);
        }
        editorCursor = (editorCursor + 1) % editors.length;
      }
    }
  }

  return map;
}

function exportXlsx(
  staff: StaffEntry[],
  assignment: Map<string, string[]>,
  channelId: string,
) {
  const header = ["Tên nhân sự", "Vai trò", "Số video", "Video IDs"];
  const rows = staff.map((s) => {
    const ids = assignment.get(s.id) ?? [];
    return [s.name, s.role === "WRITER" ? "content" : "editor", ids.length, ids.join(" ")];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 120 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nhân sự");

  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `nhan-su-mau-${channelId}-${ts}.xlsx`);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TierRow({
  tier,
  canDelete,
  maxEditors,
  onChange,
  onDelete,
}: {
  tier: Tier;
  canDelete: boolean;
  maxEditors: number;
  onChange: (patch: Partial<Tier>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {/* percent */}
      <input
        type="number"
        min={1}
        max={100}
        value={tier.percent}
        onChange={(e) => onChange({ percent: Math.max(1, Math.min(100, Number(e.target.value))) })}
        className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-semibold focus:border-blue-400 focus:outline-none"
      />
      <span className="text-zinc-400 shrink-0">% video →</span>

      {/* editorsPerVideo */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange({ editorsPerVideo: Math.max(1, tier.editorsPerVideo - 1) })}
          className="h-7 w-7 rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100 flex items-center justify-center font-bold"
        >
          −
        </button>
        <span className="w-5 text-center font-semibold text-zinc-900">{tier.editorsPerVideo}</span>
        <button
          type="button"
          onClick={() => onChange({ editorsPerVideo: Math.min(maxEditors || 10, tier.editorsPerVideo + 1) })}
          className="h-7 w-7 rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100 flex items-center justify-center font-bold"
        >
          +
        </button>
      </div>
      <span className="text-zinc-400 shrink-0">
        editor{tier.editorsPerVideo > 1 ? "" : ""}/video
      </span>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto shrink-0 rounded-lg p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function SampleExportPanel({ videos, channelId }: Props) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([
    { id: genId(), name: "", role: "WRITER" },
    { id: genId(), name: "", role: "EDITOR" },
  ]);
  const [tiers, setTiers] = useState<Tier[]>([
    { id: genId(), percent: 10, editorsPerVideo: 2 },
    { id: genId(), percent: 90, editorsPerVideo: 1 },
  ]);
  const [showPreview, setShowPreview] = useState(false);

  const videoIds = videos.map((v) => v.youtubeVideoId);
  const validStaff = staff.filter((s) => s.name.trim());
  const editorCount = validStaff.filter((s) => s.role === "EDITOR").length;
  const writerCount = validStaff.filter((s) => s.role === "WRITER").length;

  const totalPercent = tiers.reduce((sum, t) => sum + t.percent, 0);
  const percentOk = totalPercent === 100;

  const assignment = buildAssignment(videoIds, validStaff, tiers);

  // Staff helpers
  function addStaff(role: "WRITER" | "EDITOR") {
    setStaff((prev) => [...prev, { id: genId(), name: "", role }]);
  }
  function updateStaff(id: string, patch: Partial<StaffEntry>) {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeStaff(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  // Tier helpers
  function addTier() {
    setTiers((prev) => [...prev, { id: genId(), percent: 0, editorsPerVideo: 1 }]);
  }
  function updateTier(id: string, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function removeTier(id: string) {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Tạo file Excel mẫu
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-4 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Tạo file Excel mẫu nhân sự</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tất cả <span className="font-medium text-zinc-700">{videos.length} video</span> phân chia theo tỉ lệ %.
            Content và Editor có thể trùng video ID.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tier settings */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Cài đặt phân chia</p>
          <span className={`text-xs font-semibold ${percentOk ? "text-emerald-600" : "text-red-500"}`}>
            Tổng: {totalPercent}%{percentOk ? " ✓" : " ≠ 100%"}
          </span>
        </div>

        {tiers.map((tier) => (
          <TierRow
            key={tier.id}
            tier={tier}
            canDelete={tiers.length > 1}
            maxEditors={editorCount}
            onChange={(patch) => updateTier(tier.id, patch)}
            onDelete={() => removeTier(tier.id)}
          />
        ))}

        <button
          type="button"
          onClick={addTier}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-600"
        >
          <Plus className="h-3 w-3" /> Thêm nhóm
        </button>

        {!percentOk && (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Tổng % phải bằng 100. Hiện tại: {totalPercent}%.
          </p>
        )}

        <p className="text-xs text-zinc-400 pt-1 border-t border-zinc-100">
          Content: chia đều <span className="font-medium text-zinc-600">tất cả video</span> round-robin.
          Editor: áp dụng theo từng nhóm % video (theo thứ tự views giảm dần).
        </p>
      </div>

      {/* Staff */}
      <div className="space-y-3">
        {/* Writers */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-blue-700">Content (WRITER) — {writerCount} người</p>
          {staff.filter((s) => s.role === "WRITER").map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="text"
                value={s.name}
                onChange={(e) => updateStaff(s.id, { name: e.target.value })}
                placeholder="Tên nhân sự"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {staff.filter((x) => x.role === "WRITER").length > 1 && (
                <button type="button" onClick={() => removeStaff(s.id)} className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => addStaff("WRITER")} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <Plus className="h-3 w-3" /> Thêm Content
          </button>
        </div>

        {/* Editors */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-purple-700">Editor — {editorCount} người</p>
          {staff.filter((s) => s.role === "EDITOR").map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="text"
                value={s.name}
                onChange={(e) => updateStaff(s.id, { name: e.target.value })}
                placeholder="Tên nhân sự"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
              {staff.filter((x) => x.role === "EDITOR").length > 1 && (
                <button type="button" onClick={() => removeStaff(s.id)} className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => addStaff("EDITOR")} className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline">
            <Plus className="h-3 w-3" /> Thêm Editor
          </button>
        </div>
      </div>

      {/* Preview toggle */}
      {validStaff.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700"
        >
          {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showPreview ? "Ẩn preview" : "Xem preview phân chia"}
        </button>
      )}

      {showPreview && validStaff.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 text-xs">
          {validStaff.map((s) => {
            const ids = assignment.get(s.id) ?? [];
            const roleLabel = s.role === "WRITER" ? "Content" : "Editor";
            const badgeClass = s.role === "WRITER" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700";
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${badgeClass}`}>{roleLabel}</span>
                <span className="font-medium text-zinc-800 flex-1">{s.name || <span className="text-zinc-400 italic">Chưa đặt tên</span>}</span>
                <span className="text-zinc-400 shrink-0">{ids.length} video</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Export */}
      <div className="flex justify-end pt-1">
        <Button
          onClick={() => exportXlsx(validStaff, assignment, channelId)}
          disabled={validStaff.length === 0 || videos.length === 0 || !percentOk}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          size="sm"
        >
          <Download className="h-3.5 w-3.5" />
          Xuất Excel ({videos.length} video · {validStaff.length} nhân sự)
        </Button>
      </div>
    </div>
  );
}
