import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { LayoutDashboard, Tv2, Video, Users, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { ViewsLineChart } from "@/components/analytics/views-line-chart";

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("vi-VN");
}

export default async function ManagerDashboard() {
  const session = await requireRole(["MANAGER", "DIRECTOR"]);
  const userId = session.user?.id as string;

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const myChannels = await db.channel.findMany({
    where: { managerId: userId },
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { members: true, videos: true } },
    },
  });

  const channelIds = myChannels.map((c) => c.id);

  const myVideos = await db.video.findMany({
    where: { channelId: { in: channelIds }, isActive: true },
    select: { id: true },
  });
  const myVideoIds = myVideos.map((v) => v.id);

  const memberUserIds = await db.channelMember.findMany({
    where: { channelId: { in: channelIds } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const teamCount = memberUserIds.length;

  const viewsAgg = await db.videoViewsLog.aggregate({
    _sum: { viewsCount: true },
    where: { videoId: { in: myVideoIds }, recordedAt: { gte: thirtyDaysAgo } },
  });

  const viewLogs = await db.videoViewsLog.findMany({
    where: { videoId: { in: myVideoIds }, recordedAt: { gte: thirtyDaysAgo } },
    select: { viewsCount: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  const byDate: Record<string, number> = {};
  for (const log of viewLogs) {
    const date = log.recordedAt.toISOString().slice(0, 10);
    byDate[date] = (byDate[date] ?? 0) + Number(log.viewsCount);
  }

  const viewsTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    viewsTrend.push({ date: dateStr, views: byDate[dateStr] ?? 0 });
  }

  const assignments = await db.videoRoleAssignment.findMany({
    where: { videoId: { in: myVideoIds }, status: "APPROVED" },
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

  const staffPerformance = Array.from(staffMap.values()).sort((a, b) => b.views - a.views);
  const totalViews30d = Number(viewsAgg._sum.viewsCount ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard Quản lý</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Kênh của tôi"
          value={myChannels.length}
          sub={`${myChannels.filter((c) => c.status === "ACTIVE").length} đang hoạt động`}
          icon={<Tv2 className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
        <KpiCard
          title="Video"
          value={myVideoIds.length}
          sub="đang hoạt động"
          icon={<Video className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
        />
        <KpiCard
          title="Thành viên nhóm"
          value={teamCount}
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <KpiCard
          title="Lượt xem (30 ngày)"
          value={formatNumber(totalViews30d)}
          icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50"
        />
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Lượt xem 30 ngày qua</h2>
        <ViewsLineChart data={viewsTrend} />
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Hiệu suất nhân viên</h2>
        </div>
        {staffPerformance.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Chưa có dữ liệu</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Nhân viên</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Video</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Lượt xem (30 ngày)</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.map((s, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-zinc-50/50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-900">{s.name || "—"}</p>
                    <p className="text-xs text-zinc-400">{s.email}</p>
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-700">{s.videos}</td>
                  <td className="px-5 py-3 text-right font-medium text-zinc-900">
                    {formatNumber(s.views)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Kênh của tôi</h2>
        </div>
        {myChannels.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Chưa được phân công kênh nào</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Kênh</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Thành viên</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Video</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-zinc-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {myChannels.map((ch) => (
                <tr key={ch.id} className="border-b last:border-0 hover:bg-zinc-50/50">
                  <td className="px-5 py-3 font-medium text-zinc-900">{ch.name}</td>
                  <td className="px-5 py-3 text-right text-zinc-700">{ch._count.members}</td>
                  <td className="px-5 py-3 text-right text-zinc-700">{ch._count.videos}</td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        ch.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : ch.status === "INACTIVE"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-yellow-50 text-yellow-700"
                      }`}
                    >
                      {ch.status === "ACTIVE" ? "Hoạt động" : ch.status === "INACTIVE" ? "Ngừng" : "Chờ duyệt"}
                    </span>
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
