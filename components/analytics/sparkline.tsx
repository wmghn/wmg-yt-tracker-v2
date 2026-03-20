"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

type DataPoint = { date: string; views: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-md">
      <p className="text-zinc-500">{new Date(label).toLocaleDateString("vi-VN")}</p>
      <p className="font-medium text-zinc-900">{Number(payload[0].value).toLocaleString("vi-VN")} lượt xem</p>
    </div>
  );
}

export function Sparkline({ data, color = "#3b82f6" }: { data: DataPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Tooltip content={<TooltipContent />} />
        <Line
          type="monotone"
          dataKey="views"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
