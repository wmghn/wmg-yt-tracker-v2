"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface Channel {
  id: string;
  name: string;
}

interface Props {
  channels: Channel[];
  value: string;
  onChange: (id: string) => void;
}

export function ChannelDropdown({ channels, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = channels.find((c) => c.id === value);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  if (channels.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        {selected?.name ?? "Chọn kênh"}
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {channels.map((ch) => {
            const active = ch.id === value;
            return (
              <button
                key={ch.id}
                onClick={() => select(ch.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-zinc-100 font-semibold text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {ch.name}
                {active && <Check className="ml-4 h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
