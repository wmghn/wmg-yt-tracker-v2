"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { DateRangeType } from "@/lib/youtube/analytics-api";

export interface DateRangeValue {
  type: DateRangeType;
  year?: number;
  month?: number;   // 1-12
  label: string;
}

interface Props {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
  "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
  "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function buildOptions(now: Date) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  type Option = { value: DateRangeValue; label: string };
  type Group = { options: Option[] };

  const groups: Group[] = [];

  // ── Quick ranges ──────────────────────────────────────────────────────────
  groups.push({
    options: [
      { label: "7 ngày qua",      value: { type: "7days",    label: "7 ngày qua" } },
      { label: "28 ngày qua",     value: { type: "28days",   label: "28 ngày qua" } },
      { label: "90 ngày qua",     value: { type: "90days",   label: "90 ngày qua" } },
      { label: "365 ngày qua",    value: { type: "365days",  label: "365 ngày qua" } },
      { label: "Toàn thời gian",  value: { type: "lifetime", label: "Toàn thời gian" } },
    ],
  });

  // ── Years: current and previous 1 ─────────────────────────────────────────
  const years: Option[] = [];
  for (let y = currentYear; y >= currentYear - 1; y--) {
    years.push({
      label: String(y),
      value: { type: "year", year: y, label: `Năm ${y}` },
    });
  }
  groups.push({ options: years });

  // ── Months: current year only (Jan → current month) ───────────────────────
  const months: Option[] = [];
  for (let m = currentMonth; m >= 1; m--) {
    months.push({
      label: MONTH_NAMES[m - 1],
      value: { type: "month", month: m, year: currentYear, label: MONTH_NAMES[m - 1] },
    });
  }
  groups.push({ options: months });

  return groups;
}

function isSame(a: DateRangeValue, b: DateRangeValue) {
  if (a.type !== b.type) return false;
  if (a.year !== b.year) return false;
  if (a.month !== b.month) return false;
  return true;
}

export function DateRangeDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groups = buildOptions(new Date());

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(v: DateRangeValue) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        {value.label}
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="h-px bg-zinc-100 my-1 mx-2" />}
              {group.options.map((opt) => {
                const active = isSame(opt.value, value);
                return (
                  <button
                    key={opt.label}
                    onClick={() => select(opt.value)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-zinc-100 font-semibold text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {opt.label}
                    {active && <Check className="h-3.5 w-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
