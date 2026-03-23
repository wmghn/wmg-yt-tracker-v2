import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { LayoutDashboard, Tv2, Video, Users, TrendingUp, DollarSign } from "lucide-react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { ViewsLineChart } from "@/components/analytics/views-line-chart";
import { TopChannelsBarChart } from "@/components/analytics/top-channels-bar-chart";

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "USD" }).format(n);
}

export default async function DirectorDashboard() {
  await requireRole("DIRECTOR");

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalChannels, activeChannels, totalVideos, totalStaff, viewsAgg, revenueAgg] =
    await Promise.all([
      db.channel.count(),
      db.channel.count({ where: { status: "ACTIVE" } }),
      db.video.count({ where: { isActive: true } }),
      db.user.count({ where: { isActive: true, role: "STAFF" } }),
      db.videoViewsLog.aggregate({
        _sum: { viewsCount: true },
        where: { recordedAt: { gte: thirtyDaysAgo } },
      }),
      db.videoViewsLog.aggregate({
        _sum: { revenueEstimate: true },
        where: { recordedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

  // Views trend (30 days)
  const viewLogs = await db.videoViewsLog.findMany({
    where: { recordedAt: { gte: thirtyDaysAgo } },
    select: { viewsCount: true, revenueEstimate: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  const byDate: Record<string, { views: number; revenue: number }> = {};
  for (const log of viewLogs) {
    const date = log.recordedAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { views: 0, revenue: 0 };
    byDate[date].views += Number(log.viewsCount);
    byDate[date].revenue += Number(log.revenueEstimate ?? 0);
  }

  const viewsTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    viewsTrend.push({
      date: dateStr,
      views: byDate[dateStr]?.views ?? 0,
      revenue: byDate[dateStr]?.revenue ?? 0,
    });
  }

  // Top channels by views
  const channelViewsRaw = await db.videoViewsLog.groupBy({
    by: ["videoId"],
    _sum: { viewsCount: true },
    where: { recordedAt: { gte: thirtyDaysAgo } },
    orderBy: { _sum: { viewsCount: "desc" } },
    take: 100,
  });

  const videoIdList = channelViewsRaw.map((v) => v.videoId);
  const videos = await db.video.findMany({
    where: { id: { in: videoIdList } },
    select: { id: true, channel: { select: { id: true, name: true } } },
  });
  const videoChannelMap = new Map(videos.map((v) => [v.id, v.channel]));

  const channelViewsMap = new Map<string, { name: string; views: number }>();
  for (const cv of channelViewsRaw) {
    const ch = videoChannelMap.get(cv.videoId);
    if (!ch) continue;
    const existing = channelViewsMap.get(ch.id) ?? { name: ch.name, views: 0 };
    existing.views += Number(cv._sum.viewsCount ?? 0);
    channelViewsMap.set(ch.id, existing);
  }
  const topChannels = Array.from(channelViewsMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  // Top/bottom performers
  const assignments = await db.videoRoleAssignment.findMany({
    where: { status: "APPROVED" },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
      video: {
        select: {
          viewsLog: {
            where: { recordedAt: { gte: thirtyDaysAgo } },
            select: { viewsCount: true },
          },
        },
      },
    },
  });

  const staffMap = new Map<
    string,
    { name: string; email: string; views: number; videos: number }
  >();
  for (const a of assignments) {
    const views = a.video.viewsLog.reduce(
      (sum: number, l: { viewsCount: bigint }) => sum + Number(l.viewsCount),
      0
    );
    const existing = staffMap.get(a.userId) ?? {
      name: a.user.name ?? "",
      email: a.user.email ?? "",
      views: 0,
      videos: 0,
    };
    existing.views += views;
    existing.videos += 1;
    staffMap.set(a.userId, existing);
  }

  const performers = Array.from(staffMap.values()).sort((a, b) => b.views - a.views);
  const topPerformers = performers.slice(0, 5);
  const bottomPerformers = performers.slice(-5).reverse();

  const totalViews30d = Number(viewsAgg._sum.viewsCount ?? 0);
  const totalRevenue30d = Number(revenueAgg._sum.revenueEstimate ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard Giám đốc</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Tổng kênh"
          value={totalChannels}
          sub={`${activeChannels} đang hoạt động`}
          icon={<Tv2 className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
        <KpiCard
          title="Video"
          value={totalVideos}
          sub="đang hoạt động"
          icon={<Video className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
        />
        <KpiCard
          title="Nhân sự"
          value={totalStaff}
          sub="đang làm việc"
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <KpiCard
          title="Lượt xem (30 ngày)"
          value={formatNumber(totalViews30d)}
          icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50"
        />
        <KpiCard
          title="Doanh thu (30 ngày)"
          value={formatCurrency(totalRevenue30d)}
          icon={<DollarSign className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-50"
        />
        <KpiCard
          title="Kênh active / tổng"
          value={`${activeChannels}/${totalChannels}`}
          sub={`${totalChannels > 0 ? Math.round((activeChannels / totalChannels) * 100) : 0}% hoạt động`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Lượt xem 30 ngày qua</h2>
          <ViewsLineChart data={viewsTrend} />
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Top kênh theo lượt xem</h2>
          {topChannels.length > 0 ? (
            <TopChannelsBarChart data={topChannels} />
          ) : (
            <p className="py-16 text-center text-sm text-zinc-400">Chưa có dữ liệu</p>
          )}
        </div>
      </div>

      {/* Performers tables */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Top nhân viên</h2>
          </div>
          <PerformersTable data={topPerformers} />
        </div>
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Cần cải thiện</h2>
          </div>
          <PerformersTable data={bottomPerformers} />
        </div>
      </div>
    </div>
  );
}

function PerformersTable({
  data,
}: {
  data: { name: string; email: string; views: number; videos: number }[];
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">Chưa có dữ liệu</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-zinc-50">
          <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Tên</th>
          <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Video</th>
          <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Lượt xem</th>
        </tr>
      </thead>
      <tbody>
        {data.map((s, i) => (
          <tr key={i} className="border-b last:border-0 hover:bg-zinc-50/50">
            <td className="px-5 py-3">
              <p className="font-medium text-zinc-900">{s.name || "—"}</p>
              <p className="text-xs text-zinc-400">{s.email}</p>
            </td>
            <td className="px-5 py-3 text-right text-zinc-700">{s.videos}</td>
            <td className="px-5 py-3 text-right font-medium text-zinc-900">
              {s.views >= 1_000_000
                ? `${(s.views / 1_000_000).toFixed(1)}M`
                : s.views >= 1_000
                ? `${(s.views / 1_000).toFixed(0)}K`
                : s.views.toLocaleString("vi-VN")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
