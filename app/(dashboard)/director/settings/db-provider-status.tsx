"use client";

import { useEffect, useState } from "react";
import { Database, Cloud, HardDrive, RefreshCw } from "lucide-react";

type DbInfo = {
  provider: "sqlite" | "postgresql";
  label: string;
  isLocal: boolean;
};

export function DbProviderStatus() {
  const [info, setInfo] = useState<DbInfo | null>(null);

  useEffect(() => {
    fetch("/api/admin/db-provider")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Đang kiểm tra...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status badge */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        info.isLocal
          ? "bg-amber-50 border-amber-200"
          : "bg-emerald-50 border-emerald-200"
      }`}>
        {info.isLocal
          ? <HardDrive className="h-5 w-5 text-amber-600 shrink-0" />
          : <Cloud className="h-5 w-5 text-emerald-600 shrink-0" />}
        <div>
          <p className={`text-sm font-semibold ${info.isLocal ? "text-amber-700" : "text-emerald-700"}`}>
            {info.label}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {info.isLocal
              ? "Dữ liệu lưu trong file local.db (không cần kết nối Supabase)"
              : "Dữ liệu lưu trên Supabase PostgreSQL"}
          </p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${
          info.isLocal
            ? "text-amber-700 bg-amber-50 border-amber-300"
            : "text-emerald-700 bg-emerald-50 border-emerald-300"
        }`}>
          {info.isLocal ? "Local" : "Cloud"}
        </span>
      </div>

      {/* Hướng dẫn switch */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 space-y-3 text-sm">
        <p className="font-medium text-zinc-700 flex items-center gap-2">
          <Database className="h-4 w-4" />
          Cách chuyển đổi database
        </p>

        <div className="space-y-2 text-zinc-600">
          <div>
            <p className="font-medium text-zinc-800">Dùng SQLite (local, không cần Supabase):</p>
            <ol className="mt-1 space-y-1 list-decimal list-inside text-xs text-zinc-500">
              <li>Tạo file <code className="bg-zinc-100 px-1 rounded">.env.local</code> với nội dung:</li>
              <pre className="ml-5 bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-700 text-xs whitespace-pre">
{`DB_PROVIDER=sqlite
DATABASE_URL=file:./local.db`}
              </pre>
              <li>Chạy lệnh để generate client và tạo database:</li>
              <code className="block ml-5 bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-700">
                npm run db:setup:local
              </code>
              <li>Khởi động lại server: <code className="bg-zinc-100 px-1 rounded">npm run dev</code></li>
            </ol>
          </div>

          <div className="border-t border-zinc-200 pt-2">
            <p className="font-medium text-zinc-800">Dùng Supabase (production):</p>
            <p className="text-xs text-zinc-500 mt-1">
              Xoá <code className="bg-zinc-100 px-1 rounded">DB_PROVIDER</code> khỏi{" "}
              <code className="bg-zinc-100 px-1 rounded">.env.local</code>, đặt{" "}
              <code className="bg-zinc-100 px-1 rounded">DATABASE_URL</code> về Supabase connection string.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
