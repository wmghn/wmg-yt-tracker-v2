import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  title: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  iconBg?: string;
};

export function KpiCard({ title, value, sub, icon, iconBg = "bg-blue-50" }: Props) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{title}</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 truncate">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
        {icon && (
          <div className={cn("rounded-lg p-2 shrink-0", iconBg)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
