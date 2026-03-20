"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  videoId: string;        // internal DB id
  youtubeVideoId: string;
  onUpdated?: (newYtId: string) => void;
}

export function VideoIdCell({ videoId, youtubeVideoId, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(youtubeVideoId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync if prop changes (e.g. after parent refresh)
  useEffect(() => {
    if (!editing) setValue(youtubeVideoId);
  }, [youtubeVideoId, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    const trimmed = value.trim();
    if (trimmed === youtubeVideoId) { setEditing(false); return; }
    if (!/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
      setError("ID phải đúng 11 ký tự");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeVideoId: trimmed }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Lỗi lưu");
        return;
      }
      onUpdated?.(trimmed);
      setEditing(false);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(youtubeVideoId);
    setError(null);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            maxLength={11}
            className="w-[110px] rounded border border-blue-400 px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          ) : (
            <>
              <button onClick={handleSave} title="Lưu" className="text-green-600 hover:text-green-700">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleCancel} title="Huỷ" className="text-zinc-400 hover:text-zinc-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1">
      <a
        href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
      >
        {youtubeVideoId}
        <ExternalLink className="h-3 w-3" />
      </a>
      <button
        onClick={() => setEditing(true)}
        title="Sửa Video ID"
        className="invisible group-hover:visible text-zinc-400 hover:text-zinc-700"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
