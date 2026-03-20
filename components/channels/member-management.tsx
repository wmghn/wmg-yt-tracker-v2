"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Member = {
  id: string;
  userId: string;
  joinedAt: Date | string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type MemberVideoSummary = {
  userId: string;
  writerCount: number;
  editorCount: number;
  previewWriterIds: string[];
  previewEditorIds: string[];
};

type Props = {
  channelId: string;
  members: Member[];
  allUsers: User[];
  canManage: boolean;
  weightConfigs?: Record<string, number>; // role → weightPercent
};

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

// ─── Member Video Edit Dialog ─────────────────────────────────────────────────

function MemberVideoDialog({
  channelId,
  member,
  weightConfigs,
  onSaved,
}: {
  channelId: string;
  member: Member;
  weightConfigs?: Record<string, number>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"WRITER" | "EDITOR">("WRITER");
  const [texts, setTexts] = useState<Record<"WRITER" | "EDITOR", string>>({ WRITER: "", EDITOR: "" });
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingIds, setLoadingIds] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setTitleMap({});
    setLoadingIds(true);

    fetch(`/api/channels/${channelId}/member-videos?userId=${member.userId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setTexts({
          WRITER: (json.writerIds ?? []).join("\n"),
          EDITOR: (json.editorIds ?? []).join("\n"),
        });
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoadingIds(false));
  }, [open, channelId, member.userId]);

  const currentText = texts[role];
  const parsedIds = parseIds(currentText);

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
      const res = await fetch(`/api/channels/${channelId}/member-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role, videoIds: parsedIds }),
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
    if (!confirm(`Xoá tất cả video IDs vai trò "${roleLabel}" của ${member.user.name}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/member-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role, videoIds: [] }),
      });
      if (!res.ok) { setResult("❌ Lỗi xoá"); return; }
      setTexts((prev) => ({ ...prev, [role]: "" }));
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-sm text-blue-600 hover:underline font-medium">
          Sửa
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Video của {member.user.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Role selector */}
          <div className="flex gap-2">
            {(["WRITER", "EDITOR"] as const).map((r) => {
              const count = parseIds(texts[r]).length;
              const pct = weightConfigs?.[r];
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
                  {pct !== undefined && (
                    <span className={`ml-1.5 text-xs font-semibold ${
                      role === r
                        ? r === "WRITER" ? "text-blue-500" : "text-purple-500"
                        : "text-zinc-400"
                    }`}>
                      {pct}%
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

          {loadingIds ? (
            <div className="flex items-center justify-center py-10 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Đang tải...</span>
            </div>
          ) : (
            <textarea
              value={currentText}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
              placeholder={"6gVNYQTIWK0\nDrKUYV0eqTs\nnHZ-0ceWkm8"}
            />
          )}

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
                <ul className="space-y-0.5 mt-1.5 max-h-32 overflow-y-auto">
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

          {result && (
            <p className={`text-sm ${result.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
              {result}
            </p>
          )}

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

// ─── Main MemberManagement component ─────────────────────────────────────────

export function MemberManagement({ channelId, members, allUsers, canManage, weightConfigs }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Map<string, MemberVideoSummary>>(new Map());
  const [summaryLoading, setSummaryLoading] = useState(false);

  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const fetchSummaries = useCallback(async () => {
    if (!canManage || members.length === 0) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/member-videos`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const map = new Map<string, MemberVideoSummary>();
      for (const s of json.members ?? []) map.set(s.userId, s);
      setSummaries(map);
    } catch { /* non-fatal */ }
    finally { setSummaryLoading(false); }
  }, [channelId, canManage, members.length]);

  useEffect(() => { fetchSummaries(); }, [fetchSummaries]);

  async function handleAdd() {
    if (!selectedUserId) return;
    setAddLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, action: "add" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Thêm thành viên thất bại");
        return;
      }
      toast.success("Đã thêm thành viên");
      setAddOpen(false);
      setSelectedUserId("");
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveLoadingId(userId);
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Xóa thành viên thất bại");
        return;
      }
      toast.success("Đã xóa thành viên khỏi kênh");
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối");
    } finally {
      setRemoveLoadingId(null);
    }
  }

  // Determine primary role for a member from their video summaries
  function getMemberRole(userId: string): { role: "WRITER" | "EDITOR" | null; weightPercent: number | null } {
    const s = summaries.get(userId);
    if (!s) return { role: null, weightPercent: null };
    if (s.writerCount === 0 && s.editorCount === 0) return { role: null, weightPercent: null };
    const primaryRole = s.editorCount >= s.writerCount ? "EDITOR" : "WRITER";
    const weightPercent = weightConfigs?.[primaryRole] ?? null;
    return { role: primaryRole, weightPercent };
  }

  function getTotalVideoCount(userId: string): number {
    const s = summaries.get(userId);
    if (!s) return 0;
    // De-duplicate: a video may appear in both writer and editor
    const allIds = new Set([...s.previewWriterIds, ...s.previewEditorIds]);
    return Math.max(s.writerCount, s.editorCount, allIds.size);
  }

  function getPreviewIds(userId: string): string[] {
    const s = summaries.get(userId);
    if (!s) return [];
    const all = [...s.previewWriterIds, ...s.previewEditorIds];
    return Array.from(new Set(all)).slice(0, 5);
  }

  const AVATAR_COLORS = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-emerald-100 text-emerald-700",
    "bg-orange-100 text-orange-700",
    "bg-rose-100 text-rose-700",
  ];

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">Chưa có thành viên nào.</p>
      ) : (
        members.map((m, idx) => {
          const { role, weightPercent } = getMemberRole(m.userId);
          const totalCount = summaryLoading ? null : getTotalVideoCount(m.userId);
          const previewIds = getPreviewIds(m.userId);
          const s = summaries.get(m.userId);
          const totalRaw = s ? s.writerCount + s.editorCount : 0;
          const shownCount = previewIds.length;
          const remaining = Math.max(0, totalRaw - shownCount);
          const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];

          return (
            <div key={m.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor}`}>
                  {initials(m.user.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-900">{m.user.name}</span>
                    {role && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${role === "WRITER" ? "border-blue-300 text-blue-700 bg-blue-50" : "border-purple-300 text-purple-700 bg-purple-50"}`}
                      >
                        {role === "WRITER" ? "Content" : "Editor"}
                        {weightPercent !== null && ` · ${weightPercent}%`}
                      </Badge>
                    )}
                  </div>

                  {/* Video count + preview IDs */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {summaryLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    ) : totalCount !== null && totalCount > 0 ? (
                      <>
                        <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5">
                          {totalCount} videos
                        </span>
                        {previewIds.map((id) => (
                          <span key={id} className="rounded bg-zinc-100 text-zinc-600 text-xs font-mono px-1.5 py-0.5">
                            {id}
                          </span>
                        ))}
                        {remaining > 0 && (
                          <span className="text-xs text-zinc-400">+{remaining} thêm</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Chưa có video</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex items-center gap-3 shrink-0">
                    <MemberVideoDialog
                      channelId={channelId}
                      member={m}
                      weightConfigs={weightConfigs}
                      onSaved={fetchSummaries}
                    />
                    <button
                      className="text-sm text-red-500 hover:underline font-medium"
                      onClick={() => handleRemove(m.userId)}
                      disabled={removeLoadingId === m.userId}
                    >
                      {removeLoadingId === m.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Xoá"
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Add member button */}
      {canManage && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="w-full rounded-xl border-2 border-dashed border-zinc-200 py-3 text-sm text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 transition-colors flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              Thêm nhân sự
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Thêm thành viên vào kênh</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Chọn nhân viên</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn người dùng..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        Không có người dùng nào
                      </SelectItem>
                    ) : (
                      availableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  disabled={addLoading}
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={!selectedUserId || addLoading}
                >
                  {addLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Thêm
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
