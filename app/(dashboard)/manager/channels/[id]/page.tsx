import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tv2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";
import { MemberManagement } from "@/components/channels/member-management";
import { WeightConfigForm } from "@/components/channels/weight-config-form";

type Params = { params: { id: string }; searchParams: { tab?: string } };

export default async function ManagerChannelDetailPage({ params, searchParams }: Params) {
  const session = await requireRole(["MANAGER", "DIRECTOR"]);
  const userId = session.user.id;
  const role = session.user.role;

  const { id } = params;
  const activeTab = searchParams.tab ?? "info";
  const now = new Date();

  const [channel, allUsers] = await Promise.all([
    db.channel.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        weightConfigs: {
          where: { effectiveFrom: { lte: now } },
          orderBy: { effectiveFrom: "desc" },
        },
        _count: { select: { videos: true, members: true } },
      },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!channel) notFound();

  // Check access: must be a member OR be DIRECTOR
  if (role !== "DIRECTOR") {
    const isMember = channel.members.some((m) => m.userId === userId);
    if (!isMember) redirect("/manager/channels");
  }

  const isManager = channel.managerId === userId || role === "DIRECTOR";

  // Get latest weight config per role
  const latestWeights: Record<string, number> = {};
  for (const cfg of channel.weightConfigs) {
    if (!latestWeights[cfg.role]) {
      latestWeights[cfg.role] = Number(cfg.weightPercent);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/manager/channels">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Tv2 className="h-6 w-6 text-zinc-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">{channel.name}</h1>
              <ChannelStatusBadge status={channel.status} />
            </div>
            <p className="text-sm text-zinc-500 font-mono">{channel.youtubeChannelId}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="members">Thành viên ({channel._count.members})</TabsTrigger>
          {isManager && <TabsTrigger value="weights">Tỉ trọng</TabsTrigger>}
        </TabsList>

        {/* Tab Thông tin */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin kênh</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Tên kênh</p>
                  <p className="font-medium">{channel.name}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">YouTube ID</p>
                  <p className="font-mono text-xs text-zinc-600">{channel.youtubeChannelId}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Manager</p>
                  <p>{channel.manager?.name ?? "Chưa gán"}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Trạng thái</p>
                  <ChannelStatusBadge status={channel.status} />
                </div>
                {channel.description && (
                  <div className="col-span-2">
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Mô tả</p>
                    <p className="text-zinc-700">{channel.description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Thành viên */}
        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thành viên kênh</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberManagement
                channelId={channel.id}
                members={channel.members.map((m) => ({
                  ...m,
                  joinedAt: m.joinedAt.toISOString(),
                }))}
                allUsers={allUsers}
                canManage={isManager}
                weightConfigs={latestWeights}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Tỉ trọng */}
        {isManager && (
          <TabsContent value="weights" className="mt-4">
            <WeightConfigForm
              channelId={channel.id}
              initialWriter={latestWeights["WRITER"] ?? 50}
              initialEditor={latestWeights["EDITOR"] ?? 50}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
