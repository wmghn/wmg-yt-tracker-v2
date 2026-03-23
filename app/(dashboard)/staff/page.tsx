import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { LayoutDashboard, Video, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { Sparkline } from "@/components/analytics/sparkline";

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function StaffDashboard() {
  const session = await requireAuth();
  const userId = session.user?.id as string;

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const assignments = await db.videoRoleAssignment.findMany({
    where: { userId, status: "APPROVED" },
    select: {
      videoId: true,
      role: true,
      video: {
        select: {
          id: true,
          title: true,
          publishedAt: true,
          channel: { select: { name: true } },
          viewsLog: {
            orderBy: { recordedAt: "desc" },
            take: 1,
            select: { viewsCount: true, recordedAt: true },
          },
        },
      },
    },
    orderBy: { video: { publishedAt: "desc" } },
  });

  const videoIds = assignments.map((a) => a.videoId);

  const viewLogs = await db.videoViewsLog.findMany({
    where: { videoId: { in: videoIds }, recordedAt: { gte: thirtyDaysAgo } },
    select: { viewsCount: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  const byDate: Record<string, number> = {};
  for (const log of viewLogs) {
    const date = log.recordedAt.toISOString().slice(0, 10);
    byDate[date] = (byDate[date] ?? 0) + Number(log.viewsCount);
  }

  let totalViews30d = 0;
  const viewsTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const v = byDate[dateStr] ?? 0;
    totalViews30d += v;
    viewsTrend.push({ date: dateStr, views: v });
  }

  const latestPayroll = await db.payrollRecord.findFirst({
    where: { userId },
    orderBy: { calculatedAt: "desc" },
    select: {
      totalSalary: true,
      totalViews: true,
      period: { select: { month: true, year: true } },
    },
  });

  const recentVideos = assignments.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard Nhân viên</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Video của tôi"
          value={assignments.length}
          sub="đã được duyệt"
          icon={<Video className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
        />
        <KpiCard
          title="Lượt xem (30 ngày)"
          value={formatNumber(totalViews30d)}
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Lượt xem 30 ngày qua</h2>
        <p className="mb-3 text-xs text-zinc-400">Tổng lượt xem từ video của bạn</p>
        <Sparkline data={viewsTrend} />
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Video gần đây</h2>
        </div>
        {recentVideos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Chưa được phân công video nào</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Video</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Kênh</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Vai trò</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Lượt xem</th>
              </tr>
            </thead>
            <tbody>
              {recentVideos.map((a) => (
                <tr key={a.videoId} className="border-b last:border-0 hover:bg-zinc-50/50">
                  <td className="max-w-xs px-5 py-3">
                    <p className="truncate font-medium text-zinc-900">{a.video.title}</p>
                    {a.video.publishedAt && (
                      <p className="text-xs text-zinc-400">
                        {new Date(a.video.publishedAt).toLocaleDateString("vi-VN")}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{a.video.channel.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.role === "WRITER"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      {a.role === "WRITER" ? "Biên kịch" : "Dựng phim"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-zinc-900">
                    {formatNumber(Number(a.video.viewsLog[0]?.viewsCount ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
