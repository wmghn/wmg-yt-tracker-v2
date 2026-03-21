"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react";

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
  onDone?: () => void;
}

type SyncState = "idle" | "pending" | "running" | "done" | "error";

const POLL_INTERVAL_MS = 3000;

export function SyncButton({ channelId, dateRange, month, year, onDone }: Props) {
  const [state, setState] = useState<SyncState>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [elapsedSec, setElapsedSec] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  function startElapsed() {
    setElapsedSec(0);
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  }

  function startPolling(jobId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/analytics/sync/status?jobId=${jobId}`);
        if (!res.ok) return;
        const job = await res.json() as {
          status: string;
          result: SyncResult | null;
        };

        if (job.status === "done" || job.status === "error") {
          clearTimers();
          const r = job.result as SyncResult | null;
          setResult(r);
          setState(job.status === "done" && !r?.errors?.length ? "done" : "error");

          if (job.status === "done" && onDone) {
            setTimeout(onDone, 500);
          }
          // Tự reset sau 10 giây
          setTimeout(() => {
            setState("idle");
            setResult(null);
            setErrorMsg("");
          }, 10000);
        } else {
          setState(job.status as SyncState);
        }
      } catch { /* bỏ qua lỗi mạng tạm thời */ }
    }, POLL_INTERVAL_MS);
  }

  async function handleSync() {
    clearTimers();
    setState("pending");
    setResult(null);
    setErrorMsg("");
    startElapsed();

    try {
      const res = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId || undefined, dateRange, month, year }),
      });

      const data = await res.json();

      if (!res.ok) {
        clearTimers();
        setErrorMsg(data.error ?? "Sync thất bại");
        setState("error");
        return;
      }

      // Bắt đầu poll job status
      startPolling(data.jobId);
    } catch {
      clearTimers();
      setErrorMsg("Lỗi kết nối");
      setState("error");
    }
  }

  const isRunning = state === "pending" || state === "running";

  const buttonClass = isRunning
    ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
    : state === "done"
    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    : state === "error"
    ? "bg-red-50 text-red-700 hover:bg-red-100"
    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm";

  const buttonLabel =
    state === "pending" ? "Đang khởi động..."
    : state === "running" ? `Đang sync... (${elapsedSec}s)`
    : state === "done" ? "Đã cập nhật"
    : state === "error" ? "Có lỗi"
    : "Cập nhật từ YouTube";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleSync}
        disabled={isRunning}
        className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${buttonClass}`}
      >
        {isRunning ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle className="h-4 w-4" />
        ) : state === "error" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {buttonLabel}
      </button>

      {/* Trạng thái đang chạy */}
      {isRunning && (
        <p className="flex items-center gap-1 text-xs text-zinc-400">
          <Clock className="h-3 w-3" />
          Sync đang chạy nền — bạn có thể làm việc khác
        </p>
      )}

      {/* Kết quả thành công */}
      {result && state === "done" && (
        <p className="text-xs text-emerald-600">
          {result.videosSynced} video · {result.snapshotsUpserted} snapshots · {elapsedSec}s
        </p>
      )}

      {/* Lỗi từ kết quả */}
      {result && result.errors?.length > 0 && (
        <div className="max-w-xs rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-700">
          <p className="font-medium mb-1">
            {result.videosSynced} video OK · {result.errors.length} lỗi:
          </p>
          {result.errors.slice(0, 3).map((e, i) => (
            <p key={i} className="truncate opacity-80">{e}</p>
          ))}
          {result.errors.length > 3 && (
            <p className="opacity-60">+{result.errors.length - 3} lỗi khác</p>
          )}
        </div>
      )}

      {/* Lỗi network/auth */}
      {!result && state === "error" && errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
