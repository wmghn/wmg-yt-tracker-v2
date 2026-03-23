"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, RefreshCw, Power, Calendar, Repeat, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, ChevronDown, ChevronUp, XCircle, SkipForward } from "lucide-react";

interface CronConfig {
  enabled: boolean;
  frequency: string;
  runHour: number;
  dateRange: string;
  lastRunAt: string | null;
  lastResult: {
    channelsSynced?: number;
    videosSynced?: number;
    snapshotsUpserted?: number;
    errors?: string[];
  } | null;
}

interface ChannelCronConfig {
  id: string;
  name: string;
  enabled: boolean;
}

interface CronLog {
  id: string;
  runAt: string;
  status: "success" | "error" | "skipped";
  skipReason: string | null;
  channelsSynced: number;
  videosSynced: number;
  snapshotsUpserted: number;
  errors: string[];
  durationMs: number | null;
}

const FREQUENCY_OPTS = [
  { value: "daily",      label: "Hàng ngày" },
  { value: "every2days", label: "Mỗi 2 ngày" },
  { value: "weekly",     label: "Hàng tuần" },
];

const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00 UTC`,
}));

const DATE_RANGE_OPTS = [
  { value: "month",   label: "Tháng hiện tại (mặc định)" },
  { value: "28days",  label: "28 ngày qua" },
  { value: "90days",  label: "90 ngày qua" },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        on ? "bg-blue-600" : "bg-zinc-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function CronSettings() {
  const [config, setConfig] = useState<CronConfig | null>(null);
  const [channels, setChannels] = useState<ChannelCronConfig[]>([]);
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfgRes, chRes, logsRes] = await Promise.all([
      fetch("/api/admin/cron"),
      fetch("/api/admin/cron/channels"),
      fetch("/api/admin/cron/logs"),
    ]);
    if (cfgRes.ok) setConfig(await cfgRes.json());
    if (chRes.ok) setChannels((await chRes.json()).channels ?? []);
    if (logsRes.ok) setLogs((await logsRes.json()).logs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveGlobal(patch: Partial<CronConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    setSaving(true);
    await fetch("/api/admin/cron", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  }

  async function toggleChannel(channelId: string, enabled: boolean) {
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, enabled } : c))
    );
    await fetch("/api/admin/cron/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, enabled }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-zinc-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Đang tải...</span>
      </div>
    );
  }

  if (!config) return null;

  const enabledChannels = channels.filter((c) => c.enabled).length;
  const sortedChannels = [...channels].sort((a, b) => {
    if (a.enabled === b.enabled) return a.name.localeCompare(b.name);
    return a.enabled ? -1 : 1;
  });

  return (
    <div className="space-y-6">
      {/* Global on/off + status bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Power className={`h-5 w-5 ${config.enabled ? "text-blue-600" : "text-zinc-400"}`} />
          <div>
            <p className="text-sm font-semibold text-zinc-900">Cron Job Analytics</p>
            <p className="text-xs text-zinc-400">
              {config.enabled
                ? `Đang bật — sync ${enabledChannels}/${channels.length} kênh`
                : "Đã tắt toàn bộ"}
            </p>
          </div>
        </div>
        <Toggle on={config.enabled} onChange={(v) => saveGlobal({ enabled: v })} />
      </div>

      {/* Schedule config */}
      <div className={`grid gap-4 sm:grid-cols-3 ${!config.enabled ? "opacity-40 pointer-events-none" : ""}`}>
        {/* Frequency */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            <Repeat className="h-3.5 w-3.5" /> Tần suất
          </label>
          <select
            value={config.frequency}
            onChange={(e) => saveGlobal({ frequency: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          >
            {FREQUENCY_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Run hour */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            <Clock className="h-3.5 w-3.5" /> Giờ chạy (UTC)
          </label>
          <select
            value={config.runHour}
            onChange={(e) => saveGlobal({ runHour: Number(e.target.value) })}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          >
            {HOUR_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-zinc-400">
            Giờ VN (UTC+7): {String((config.runHour + 7) % 24).padStart(2, "0")}:00
          </p>
        </div>

        {/* Date range */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            <Calendar className="h-3.5 w-3.5" /> Khoảng dữ liệu
          </label>
          <select
            value={config.dateRange}
            onChange={(e) => saveGlobal({ dateRange: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          >
            {DATE_RANGE_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Last run status */}
      {config.lastRunAt && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          config.lastResult?.errors?.length
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <div className="flex items-center gap-2">
            {config.lastResult?.errors?.length
              ? <AlertCircle className="h-4 w-4 shrink-0" />
              : <CheckCircle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">
              Lần chạy cuối: {new Date(config.lastRunAt).toLocaleString("vi-VN", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </div>
          {config.lastResult && (
            <p className="mt-1 ml-6 text-xs opacity-80">
              {config.lastResult.channelsSynced} kênh ·{" "}
              {config.lastResult.videosSynced} video ·{" "}
              {config.lastResult.snapshotsUpserted} snapshots
              {config.lastResult.errors?.length
                ? ` · ${config.lastResult.errors.length} lỗi`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Per-channel config */}
      {channels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Kênh ({enabledChannels}/{channels.length} bật)
            </p>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => channels.forEach((c) => !c.enabled && toggleChannel(c.id, true))}
                className="text-xs text-blue-600 hover:underline"
              >
                Bật tất cả
              </button>
              <span className="text-zinc-300">·</span>
              <button
                type="button"
                onClick={() => channels.forEach((c) => c.enabled && toggleChannel(c.id, false))}
                className="text-xs text-zinc-500 hover:underline"
              >
                Tắt tất cả
              </button>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            {sortedChannels.map((ch, i) => {
              const isActive = ch.enabled && !!config.enabled;
              return (
                <div
                  key={ch.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < sortedChannels.length - 1 ? "border-b" : ""
                  } ${!isActive ? "bg-zinc-50" : ""}`}
                >
                  <div className="flex items-center gap-2.5">
                    {isActive
                      ? <ToggleRight className="h-4 w-4 text-blue-500 shrink-0" />
                      : <ToggleLeft className="h-4 w-4 text-zinc-300 shrink-0" />}
                    <span className={`text-sm font-medium ${isActive ? "text-zinc-900" : "text-zinc-400"}`}>
                      {ch.name}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        đang chạy
                      </span>
                    )}
                  </div>
                  <Toggle on={ch.enabled} onChange={(v) => toggleChannel(ch.id, v)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Run log */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLogsExpanded((v) => !v)}
          className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700"
        >
          <Clock className="h-3.5 w-3.5" />
          Lịch sử chạy ({logs.length})
          {logsExpanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
        </button>

        {logsExpanded && (
          <div className="rounded-xl border overflow-hidden text-xs">
            {logs.length === 0 ? (
              <p className="px-4 py-3 text-zinc-400">Chưa có log nào.</p>
            ) : (
              logs.map((log, i) => {
                const isSuccess = log.status === "success";
                const isError = log.status === "error";
                const isSkipped = log.status === "skipped";
                return (
                  <div
                    key={log.id}
                    className={`px-4 py-3 ${i < logs.length - 1 ? "border-b" : ""} ${
                      isError ? "bg-red-50" : isSkipped ? "bg-zinc-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {isSuccess && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                      {isError   && <XCircle      className="h-3.5 w-3.5 text-red-500    shrink-0 mt-0.5" />}
                      {isSkipped && <SkipForward  className="h-3.5 w-3.5 text-zinc-400   shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${isError ? "text-red-700" : isSkipped ? "text-zinc-500" : "text-emerald-700"}`}>
                            {isSuccess ? "Thành công" : isError ? "Lỗi" : "Bỏ qua"}
                          </span>
                          <span className="text-zinc-400">
                            {new Date(log.runAt).toLocaleString("vi-VN", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                          {log.durationMs != null && (
                            <span className="text-zinc-400">· {(log.durationMs / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                        {isSkipped && log.skipReason && (
                          <p className="mt-0.5 text-zinc-400">{log.skipReason}</p>
                        )}
                        {isSuccess && (
                          <p className="mt-0.5 text-zinc-500">
                            {log.channelsSynced} kênh · {log.videosSynced} video · {log.snapshotsUpserted} snapshots
                          </p>
                        )}
                        {isError && log.errors.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {log.errors.map((e, j) => (
                              <li key={j} className="text-red-600 break-all">{e}</li>
                            ))}
                          </ul>
                        )}
                        {isError && log.channelsSynced > 0 && (
                          <p className="mt-0.5 text-zinc-500">
                            Đã sync được: {log.channelsSynced} kênh · {log.videosSynced} video · {log.snapshotsUpserted} snapshots
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Save indicator */}
      {(saving || savedOk) && (
        <p className="text-xs text-right text-zinc-400">
          {saving ? "Đang lưu..." : "✓ Đã lưu"}
        </p>
      )}
    </div>
  );
}
