import { Video } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { VideoThumbnail } from "@/components/videos/video-thumbnail";
import { RoleBadge } from "@/components/videos/role-badge";
import { AssignmentStatusBadge } from "@/components/videos/assignment-status-badge";
import { VideoSubmitDialog } from "@/components/videos/video-submit-dialog";

export default async function StaffVideosPage() {
  const session = await requireRole("STAFF");
  const userId = session.user.id;

  // Fetch channels user is member of
  const [videos, memberships] = await Promise.all([
    db.video.findMany({
      where: { submittedBy: userId },
      orderBy: { createdAt: "desc" },
      include: {
        channel: { select: { id: true, name: true } },
        roleAssignments: {
          where: { userId },
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        viewsLog: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    }),
    db.channelMember.findMany({
      where: { userId },
      include: {
        channel: { select: { id: true, name: true } },
      },
    }),
  ]);

  const channels = memberships.map((m) => ({
    id: m.channel.id,
    name: m.channel.name,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Video của tôi</h1>
        </div>
        <VideoSubmitDialog channels={channels} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Thumbnail</TableHead>
                <TableHead>Tên video</TableHead>
                <TableHead>Kênh</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-zinc-500 py-10"
                  >
                    Bạn chưa khai báo video nào.
                  </TableCell>
                </TableRow>
              ) : (
                videos.map((video) => {
                  const latestViews = video.viewsLog[0];
                  const assignments = video.roleAssignments;

                  return (
                    <TableRow key={video.id}>
                      <TableCell>
                        <VideoThumbnail
                          src={video.thumbnailUrl}
                          alt={video.title}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <p className="font-medium text-zinc-900 line-clamp-2 text-sm">
                            {video.title}
                          </p>
                          <p className="text-xs text-zinc-400 font-mono mt-0.5">
                            {video.youtubeVideoId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-600 text-sm">
                        {video.channel.name}
                      </TableCell>
                      <TableCell>
                        {assignments.length === 0 ? (
                          <span className="text-zinc-400 text-xs italic">
                            Chưa gán
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {assignments.map((a) => (
                              <RoleBadge key={a.id} role={a.role} />
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600 text-sm">
                        {latestViews
                          ? Number(latestViews.viewsCount).toLocaleString(
                              "vi-VN"
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {assignments.length === 0 ? (
                          <span className="text-zinc-400 text-xs italic">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {assignments.map((a) => (
                              <AssignmentStatusBadge
                                key={a.id}
                                status={a.status}
                              />
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
