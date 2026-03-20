"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Check, Loader2, ListVideo, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  channelId: string;
  channelName: string;
  onSaved: () => void;
}

interface WeightConfig {
  role: string;
  weightPercent: number;
}

interface ChannelMember {
  userId: string;
  name: string;
  role: string;
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

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(-2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-rose-100 text-rose-700",
];

export function StaffVideoIdsDialog({ channelId, channelName, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"WRITER" | "EDITOR">("WRITER");

  const [texts, setTexts] = useState<Record<"WRITER" | "EDITOR", string>>({ WRITER: "", EDITOR: "" });
  const [coWorkers, setCoWorkers] = useState<Record<"WRITER" | "EDITOR", string[]>>({ WRITER: [], EDITOR: [] });

  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, number | null>>({ WRITER: null, EDITOR: null });
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setTitleMap({});
    setLoadingIds(true);

    Promise.all([
      fetch(`/api/staff/video-ids?channelId=${channelId}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/channels/${channelId}/weights`).then((r) => r.json()),
      fetch(`/api/channels/${channelId}/members-list`).then((r) => r.json()),
    ])
      .then(([idsJson, weightConfigs, membersJson]) => {
        setTexts({
          WRITER: (idsJson.writerIds ?? []).join("\n"),
          EDITOR: (idsJson.editorIds ?? []).join("\n"),
        });

        const map: Record<string, number | null> = { WRITER: null, EDITOR: null };
        for (const c of (weightConfigs as WeightConfig[])) {
          if (c.role === "WRITER" || c.role === "EDITOR") map[c.role] = Number(c.weightPercent);
        }
        setWeights(map);
        setMembers(membersJson.members ?? []);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoadingIds(false));
  }, [open, channelId]);

  const currentText = texts[role];
  const parsedIds = parseIds(currentText);
  const currentCoWorkers = coWorkers[role];

  const lookupTitles = useCallback((ids: string[]) => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (ids.length === 0) { setTitleMap({}); return; }
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/videos/lookup?ids=${ids.join(",")}`);
        if (!res.ok) return;
        const json = await res.json();
        const map: Record<string, string> = {};
        for (const v of json.videos ?? []) map[v.youtubeVideoId] = v.title;
        setTitleMap(map);
      } catch { /* non-fatal */ }
    }, 600);
  }, []);

  useEffect(() => {
    lookupTitles(parsedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentText]);

  function setText(value: string) {
    setTexts((prev) => ({ ...prev, [role]: value }));
    setResult(null);
  }

  function toggleCoWorker(userId: string) {
    setCoWorkers((prev) => {
      const current = prev[role];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return { ...prev, [role]: next };
    });
  }

  function handleUploadTxt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setTexts((prev) => ({
        ...prev,
        [role]: prev[role].trim() ? prev[role] + "\n" + content : content,
      }));
      setResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/staff/video-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          youtubeVideoIds: parsedIds,
          role,
          coWorkerIds: currentCoWorkers,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setResult(`❌ ${json.error ?? "Lỗi lưu"}`); return; }
      const parts = [];
      if (json.created > 0) parts.push(`+${json.created} mới`);
      if (json.deactivated > 0) parts.push(`-${json.deactivated} đã xoá`);
      if (json.reactivated > 0) parts.push(`↩ ${json.reactivated} khôi phục`);
      setResult(`✓ Đã lưu${parts.length ? " — " + parts.join(", ") : ""}`);
      onSaved();
    } catch {
      setResult("❌ Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const roleLabel = role === "WRITER" ? "Content" : "Editor";
    if (!confirm(`Xoá tất cả video IDs vai trò "${roleLabel}" bạn đã khai báo trong kênh "${channelName}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/staff/video-ids?channelId=${channelId}&role=${role}`, { method: "DELETE" });
      setTexts((prev) => ({ ...prev, [role]: "" }));
      setCoWorkers((prev) => ({ ...prev, [role]: [] }));
      setTitleMap({});
      setResult(`✓ Đã xoá tất cả video ${roleLabel}`);
      onSaved();
    } catch {
      setResult("❌ Lỗi kết nối");
    } finally {
      setDeleting(false);
    }
  }

  const matchedCount = parsedIds.filter((id) => titleMap[id]).length;
  const hasCurrentIds = currentText.trim().length > 0;

  // Members other than the current user (self is automatically included)
  const otherMembers = members;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListVideo className="h-4 w-4" />
          Quản lý Video IDs
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Video IDs — {channelName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Role selector */}
          <div className="flex gap-2">
            {(["WRITER", "EDITOR"] as const).map((r) => {
              const count = parseIds(texts[r]).length;
              const cwCount = coWorkers[r].length;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRole(r); setResult(null); }}
                  className={`flex-1 rounded-lg border py-2 px-3 text-sm font-medium transition-colors ${
                    role === r
                      ? r === "WRITER"
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-purple-400 bg-purple-50 text-purple-700"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  {r === "WRITER" ? "Content (Nội dung)" : "Editor (Dựng phim)"}
                  {weights[r] !== null && (
                    <span className={`ml-1.5 text-xs font-semibold ${
                      role === r
                        ? r === "WRITER" ? "text-blue-500" : "text-purple-500"
                        : "text-zinc-400"
                    }`}>
                      {weights[r]}%
                    </span>
                  )}
                  {count > 0 && (
                    <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
                      role === r
                        ? r === "WRITER" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
                        : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {count}
                    </span>
                  )}
                  {cwCount > 0 && (
                    <span className="ml-1 text-xs text-zinc-400">+{cwCount} người</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Label + upload */}
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
            <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleUploadTxt} />
          </div>

          {/* Textarea */}
          {loadingIds ? (
            <div className="flex items-center justify-center py-10 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Đang tải...</span>
            </div>
          ) : (
            <textarea
              value={currentText}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
              placeholder={"6gVNYQTIWK0\nDrKUYV0eqTs\nnHZ-0ceWkm8"}
            />
          )}

          {/* Matched titles from DB */}
          {!loadingIds && parsedIds.length > 0 && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${matchedCount > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-zinc-50 border-zinc-200 text-zinc-500"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 shrink-0" />
                <span className="font-medium">
                  {matchedCount > 0
                    ? `${matchedCount} video khớp trong database`
                    : `${parsedIds.length} video ID hợp lệ`}
                </span>
              </div>
              {matchedCount > 0 && (
                <ul className="space-y-0.5 mt-1.5 max-h-24 overflow-y-auto">
                  {parsedIds.map((id) =>
                    titleMap[id] ? (
                      <li key={id} className="flex items-start gap-2 text-xs">
                        <span className="font-mono text-emerald-600 shrink-0">{id}</span>
                        <span className="text-zinc-600 line-clamp-1">{titleMap[id]}</span>
                      </li>
                    ) : null
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Co-workers section */}
          {!loadingIds && otherMembers.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-zinc-700">
                  Người làm cùng vai trò {role === "WRITER" ? "Content" : "Editor"}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Chọn thành viên khác cùng làm các video trên — views sẽ được chia đều
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {otherMembers.map((m, idx) => {
                  const selected = currentCoWorkers.includes(m.userId);
                  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleCoWorker(m.userId)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                    >
                      <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${selected ? "bg-blue-200 text-blue-800" : color}`}>
                        {initials(m.name)}
                      </span>
                      <span className="font-medium">{m.name}</span>
                      {selected && <X className="h-3 w-3 text-blue-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {currentCoWorkers.length > 0 && (
                <p className="text-xs text-blue-600 font-medium">
                  ✓ {currentCoWorkers.length + 1} người làm cùng vai trò → views ÷ {currentCoWorkers.length + 1}
                </p>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <p className={`text-sm ${result.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
              {result}
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || loadingIds || parsedIds.length === 0} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lưu thay đổi
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving || deleting}>
              Huỷ
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting || loadingIds || !hasCurrentIds}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xoá
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
