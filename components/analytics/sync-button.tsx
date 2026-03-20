"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

interface SyncResult {
  channelsSynced: number;
  videosSynced: number;
  snapshotsUpserted: number;
  errors: string[];
}

interface Props {
  channelId?: string;
  dateRange: string;
  month?: number;
  year?: number;
  onDone?: () => void; // callback để refresh data sau khi sync
}

type SyncState = "idle" | "loading" | "success" | "error";

export function SyncButton({ channelId, dateRange, month, year, onDone }: Props) {
  const [state, setState] = useState<SyncState>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSync() {
    setState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channelId || undefined,
          dateRange,
          month,
          year,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Sync thất bại");
        setState("error");
        return;
      }

      setResult(data as SyncResult);
      setState(data.errors?.length > 0 ? "error" : "success");

      // Auto-refresh data sau 500ms
      if (onDone) {
        setTimeout(onDone, 500);
      }

      // Reset về idle sau 8 giây
      setTimeout(() => setState("idle"), 8000);
    } catch {
      setErrorMsg("Lỗi kết nối");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleSync}
        disabled={state === "loading"}
        className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
          state === "loading"
            ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
            : state === "success"
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : state === "error"
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
        }`}
      >
        {state === "loading" ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : state === "success" ? (
          <CheckCircle className="h-4 w-4" />
        ) : state === "error" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {state === "loading"
          ? "Đang lấy dữ liệu..."
          : state === "success"
          ? "Đã cập nhật"
          : state === "error"
          ? "Có lỗi"
          : "Cập nhật từ YouTube"}
      </button>

      {/* Result summary */}
      {result && state === "success" && (
        <p className="text-xs text-emerald-600">
          {result.videosSynced} video · {result.snapshotsUpserted} snapshots
        </p>
      )}

      {/* Partial errors */}
      {result && result.errors.length > 0 && (
        <div className="max-w-xs rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-700">
          <p className="font-medium mb-1">
            {result.videosSynced} video OK · {result.errors.length} lỗi:
          </p>
          {result.errors.slice(0, 3).map((e, i) => (
            <p key={i} className="truncate opacity-80">
              {e}
            </p>
          ))}
          {result.errors.length > 3 && (
            <p className="opacity-60">+{result.errors.length - 3} lỗi khác</p>
          )}
        </div>
      )}

      {/* No result errors (network/auth) */}
      {!result && state === "error" && errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
