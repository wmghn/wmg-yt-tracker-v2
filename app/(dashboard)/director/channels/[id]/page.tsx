import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tv2, Youtube } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";
import { ChannelEditForm } from "@/components/channels/channel-edit-form";
import { MemberManagement } from "@/components/channels/member-management";
import { WeightConfigForm } from "@/components/channels/weight-config-form";
import { YoutubeOAuthCard } from "@/components/channels/youtube-oauth-card";

type Params = {
  params: { id: string };
  searchParams: { tab?: string; success?: string; error?: string };
};

export default async function DirectorChannelDetailPage({ params, searchParams }: Params) {
  await requireRole("DIRECTOR");

  const { id } = params;
  const activeTab = searchParams.tab ?? "info";
  const now = new Date();

  const [channel, managers, allUsers] = await Promise.all([
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
        oauthToken: {
          select: { id: true, expiresAt: true, scope: true, updatedAt: true, ytChannelId: true, ytChannelName: true },
        },
        _count: { select: { videos: true, members: true } },
      },
    }),
    db.user.findMany({
      where: { role: "MANAGER", isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!channel) notFound();

  const latestWeights: Record<string, number> = {};
  for (const cfg of channel.weightConfigs) {
    if (!latestWeights[cfg.role]) {
      latestWeights[cfg.role] = Number(cfg.weightPercent);
    }
  }

  const isConnected = !!channel.oauthToken;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/director/channels">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Tv2 className="h-6 w-6 text-zinc-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">{channel.name}</h1>
              <ChannelStatusBadge status={channel.status} />
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  <Youtube className="h-3 w-3" />
                  Analytics
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500 font-mono">{channel.youtubeChannelId}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="members">Thành viên ({channel._count.members})</TabsTrigger>
          <TabsTrigger value="weights">Tỉ trọng</TabsTrigger>
          <TabsTrigger value="oauth">
            <Youtube className="h-3.5 w-3.5 mr-1.5" />
            YouTube
            {isConnected && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab Thông tin */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin kênh</CardTitle>
            </CardHeader>
            <CardContent>
              <ChannelEditForm
                channelId={channel.id}
                defaultValues={{
                  name: channel.name,
                  description: channel.description,
                  status: channel.status,
                  managerId: channel.managerId,
                }}
                managers={managers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Thành viên */}
        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quản lý thành viên</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberManagement
                channelId={channel.id}
                members={channel.members.map((m) => ({
                  ...m,
                  joinedAt: m.joinedAt.toISOString(),
                }))}
                allUsers={allUsers}
                canManage={true}
                weightConfigs={latestWeights}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Tỉ trọng */}
        <TabsContent value="weights" className="mt-4">
          <WeightConfigForm
            channelId={channel.id}
            initialWriter={latestWeights["WRITER"] ?? 50}
            initialEditor={latestWeights["EDITOR"] ?? 50}
          />
        </TabsContent>

        {/* Tab YouTube OAuth */}
        <TabsContent value="oauth" className="mt-4">
          <YoutubeOAuthCard
            channelId={channel.id}
            isConnected={isConnected}
            connectedAt={channel.oauthToken?.updatedAt.toISOString() ?? null}
            expiresAt={channel.oauthToken?.expiresAt.toISOString() ?? null}
            scope={channel.oauthToken?.scope ?? null}
            ytChannelId={channel.oauthToken?.ytChannelId ?? null}
            ytChannelName={channel.oauthToken?.ytChannelName ?? null}
            errorParam={searchParams.error ?? null}
            successParam={searchParams.success === "1"}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
