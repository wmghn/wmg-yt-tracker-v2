import { requireRole } from "@/lib/auth";
import { Settings } from "lucide-react";
import { PermissionsTable } from "./permissions-table";
import { CronSettings } from "./cron-settings";
import { DbProviderStatus } from "./db-provider-status";
import { db } from "@/lib/db";
import type { Metric } from "@prisma/client";

const ALL_METRICS: Metric[] = ["REVENUE", "VIEWS", "CPM", "RPM", "IMPRESSIONS"];

export default async function SettingsPage() {
  await requireRole("DIRECTOR");

  const configs = await db.permissionConfig.findMany();

  const matrix: Record<string, string[]> = {};
  for (const m of ALL_METRICS) matrix[m] = ["DIRECTOR"];
  for (const c of configs) matrix[c.metric] = c.allowedRoles;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Cài đặt</h1>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Phân quyền xem chỉ số</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Cấu hình vai trò nào được phép xem từng chỉ số. Director luôn có quyền xem tất cả.
          </p>
        </div>
        <PermissionsTable initialMatrix={matrix} />
      </div>

      {/* Database Provider */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Cơ sở dữ liệu</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Hiển thị database đang dùng. Có thể chuyển sang SQLite local khi không có Supabase.
          </p>
        </div>
        <div className="px-5 py-5">
          <DbProviderStatus />
        </div>
      </div>

      {/* Cron Job Settings */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Tự động đồng bộ (Cron Job)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Cấu hình lịch tự động kéo dữ liệu từ YouTube Analytics cho từng kênh.
            Cron chạy mỗi giờ và kiểm tra xem có đến giờ chạy chưa.
          </p>
        </div>
        <div className="px-5 py-5">
          <CronSettings />
        </div>
      </div>
    </div>
  );
}
