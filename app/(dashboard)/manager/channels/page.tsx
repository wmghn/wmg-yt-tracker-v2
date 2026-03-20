import Link from "next/link";
import { Tv2, Eye } from "lucide-react";
import { requireRole, getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";

export default async function ManagerChannelsPage() {
  const session = await requireRole(["MANAGER", "DIRECTOR"]);
  const userId = session.user.id;

  const channels = await db.channel.findMany({
    where: {
      members: { some: { userId } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { members: true, videos: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Tv2 className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Kênh của tôi</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách kênh</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên kênh</TableHead>
                <TableHead>YouTube ID</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thành viên</TableHead>
                <TableHead className="text-right">Video</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-10">
                    Bạn chưa là thành viên của kênh nào.
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell className="font-medium">{channel.name}</TableCell>
                    <TableCell className="text-zinc-500 font-mono text-xs">
                      {channel.youtubeChannelId}
                    </TableCell>
                    <TableCell>
                      <ChannelStatusBadge status={channel.status} />
                    </TableCell>
                    <TableCell className="text-right text-zinc-500">
                      {channel._count.members}
                    </TableCell>
                    <TableCell className="text-right text-zinc-500">
                      {channel._count.videos}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/manager/channels/${channel.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
