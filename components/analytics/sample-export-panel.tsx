"use client";

import { useState } from "react";
import { Plus, Trash2, Download, ChevronDown, ChevronUp, X } from "lucide-react";
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

interface Props {
  videos: VideoItem[];
  channelId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Distribute videos round-robin among staff.
 * Returns a map of staffId → videoId[].
 */
function distributeVideos(
  videoIds: string[],
  staff: StaffEntry[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of staff) map.set(s.id, []);
  if (staff.length === 0) return map;
  videoIds.forEach((vid, i) => {
    const person = staff[i % staff.length];
    map.get(person.id)!.push(vid);
  });
  return map;
}

function exportXlsx(staff: StaffEntry[], assignment: Map<string, string[]>, channelId: string) {
  const header = ["Tên nhân sự", "Vai trò", "Số video", "Video IDs"];
  const rows = staff.map((s) => {
    const ids = assignment.get(s.id) ?? [];
    return [
      s.name,
      s.role === "WRITER" ? "content" : "editor",
      ids.length,
      ids.join(" "),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 120 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nhân sự");

  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `nhan-su-mau-${channelId}-${ts}.xlsx`);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SampleExportPanel({ videos, channelId }: Props) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([
    { id: genId(), name: "", role: "WRITER" },
  ]);

  const videoIds = videos.map((v) => v.youtubeVideoId);
  const validStaff = staff.filter((s) => s.name.trim());
  const assignment = distributeVideos(videoIds, validStaff);

  function addRow() {
    setStaff((prev) => [...prev, { id: genId(), name: "", role: "EDITOR" }]);
  }

  function updateRow(id: string, patch: Partial<StaffEntry>) {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeRow(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  function handleExport() {
    if (validStaff.length === 0) return;
    exportXlsx(validStaff, assignment, channelId);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Tạo file Excel mẫu để import
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Tạo file Excel mẫu</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {videos.length} video sẽ được chia đều cho các nhân sự bên dưới
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Staff rows */}
      <div className="space-y-2">
        {staff.map((s) => {
          const assignedCount = assignment.get(s.id)?.length ?? 0;
          const isValid = s.name.trim().length > 0;

          return (
            <div key={s.id} className="flex items-center gap-2">
              {/* Name */}
              <input
                type="text"
                value={s.name}
                onChange={(e) => updateRow(s.id, { name: e.target.value })}
                placeholder="Tên nhân sự"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />

              {/* Role toggle */}
              <div className="flex rounded-lg border border-zinc-200 overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => updateRow(s.id, { role: "WRITER" })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    s.role === "WRITER"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  Content
                </button>
                <button
                  type="button"
                  onClick={() => updateRow(s.id, { role: "EDITOR" })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    s.role === "EDITOR"
                      ? "bg-purple-600 text-white"
                      : "bg-white text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  Editor
                </button>
              </div>

              {/* Video count badge */}
              {isValid && (
                <span className="shrink-0 text-xs text-zinc-400 w-14 text-center">
                  {assignedCount} video
                </span>
              )}

              {/* Delete */}
              {staff.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(s.id)}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm nhân sự
      </button>

      {/* Preview */}
      {validStaff.length > 0 && videos.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 space-y-1">
          <p className="font-semibold text-zinc-700 mb-1.5">Preview phân chia:</p>
          {validStaff.map((s) => {
            const ids = assignment.get(s.id) ?? [];
            const roleLabel = s.role === "WRITER" ? "Content" : "Editor";
            return (
              <div key={s.id} className="flex items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${
                  s.role === "WRITER" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                }`}>
                  {roleLabel}
                </span>
                <span className="font-medium text-zinc-800">{s.name}</span>
                <span className="text-zinc-400">— {ids.length} video</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-end">
        <Button
          onClick={handleExport}
          disabled={validStaff.length === 0 || videos.length === 0}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          size="sm"
        >
          <Download className="h-3.5 w-3.5" />
          Xuất Excel
        </Button>
      </div>
    </div>
  );
}
