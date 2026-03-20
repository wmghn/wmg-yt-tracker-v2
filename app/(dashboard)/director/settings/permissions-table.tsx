"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Lock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Metric = "REVENUE" | "VIEWS" | "CPM" | "RPM" | "IMPRESSIONS";

const METRICS: { key: Metric; label: string; description: string }[] = [
  { key: "VIEWS", label: "Lượt xem", description: "Số lượt xem video" },
  { key: "REVENUE", label: "Doanh thu", description: "Ước tính doanh thu ($)" },
  { key: "CPM", label: "CPM", description: "Cost per mille" },
  { key: "RPM", label: "RPM", description: "Revenue per mille" },
  { key: "IMPRESSIONS", label: "Impressions", description: "Số lần hiển thị" },
];

const ROLES = [
  { key: "MANAGER", label: "Quản lý" },
  { key: "STAFF", label: "Nhân viên" },
];

type Props = {
  initialMatrix: Record<string, string[]>;
};

type SaveState = "idle" | "saving" | "saved";

export function PermissionsTable({ initialMatrix }: Props) {
  const [matrix, setMatrix] = useState<Record<Metric, string[]>>(
    initialMatrix as Record<Metric, string[]>
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveChanges = useCallback(async (newMatrix: Record<Metric, string[]>) => {
    setSaveState("saving");
    try {
      const configs = Object.entries(newMatrix).map(([metric, allowedRoles]) => ({
        metric,
        allowedRoles,
      }));
      await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }, []);

  const handleToggle = (metric: Metric, role: string, checked: boolean) => {
    setMatrix((prev) => {
      const current = prev[metric] ?? ["DIRECTOR"];
      const updated = checked
        ? Array.from(new Set([...current, role]))
        : current.filter((r) => r !== role);
      const next = { ...prev, [metric]: updated };

      // Debounce save
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveChanges(next), 500);

      return next;
    });
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div>
      {/* Save indicator */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-5 py-2 text-xs transition-opacity",
          saveState === "idle" ? "opacity-0" : "opacity-100"
        )}
      >
        {saveState === "saving" ? (
          <span className="text-zinc-400">Đang lưu...</span>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-emerald-600 font-medium">Đã lưu</span>
          </>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50">
            <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500">Chỉ số</th>
            <th className="px-5 py-3 text-center text-xs font-medium text-zinc-500">
              Director
            </th>
            {ROLES.map((r) => (
              <th
                key={r.key}
                className="px-5 py-3 text-center text-xs font-medium text-zinc-500"
              >
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key} className="border-b last:border-0 hover:bg-zinc-50/50">
              <td className="px-5 py-4">
                <p className="font-medium text-zinc-900">{m.label}</p>
                <p className="text-xs text-zinc-400">{m.description}</p>
              </td>

              {/* Director — always locked */}
              <td className="px-5 py-4 text-center">
                <div className="flex items-center justify-center">
                  <div
                    className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-600"
                    title="Director luôn có quyền"
                  >
                    <Lock className="h-3 w-3" />
                    <span className="text-xs font-medium">Always</span>
                  </div>
                </div>
              </td>

              {/* Toggleable roles */}
              {ROLES.map((r) => {
                const checked = (matrix[m.key] ?? ["DIRECTOR"]).includes(r.key);
                return (
                  <td key={r.key} className="px-5 py-4 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={checked}
                        onCheckedChange={(val) => handleToggle(m.key, r.key, val)}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
