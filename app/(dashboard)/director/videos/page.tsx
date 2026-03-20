import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoThumbnail } from "@/components/videos/video-thumbnail";
import { RoleBadge } from "@/components/videos/role-badge";
import { AssignmentStatusBadge } from "@/components/videos/assignment-status-badge";
import { ApproveButton } from "@/components/videos/approve-button";

type SearchParams = {
  tab?: string;
};

type AssignmentStatus = "PENDING" | "APPROVED" | "REJECTED";

async function getVideosByStatus(status: AssignmentStatus) {
  return db.video.findMany({
    where: {
      roleAssignments: { some: { status } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      channel: { select: { id: true, name: true } },
      submitter: { select: { id: true, name: true, email: true } },
      roleAssignments: {
        where: { status },
        include: {
          user: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      viewsLog: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });
}

function VideoTable({
  videos,
  showActions,
}: {
  videos: Awaited<ReturnType<typeof getVideosByStatus>>;
  showActions?: boolean;
}) {
  if (videos.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-12">
        Không có video nào.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Thumbnail</TableHead>
          <TableHead>Tên video</TableHead>
          <TableHead>Kênh</TableHead>
          <TableHead>Nhân sự</TableHead>
          <TableHead>Vai trò</TableHead>
          <TableHead className="text-right">Views</TableHead>
          {showActions && <TableHead>Thao tác</TableHead>}
          {!showActions && <TableHead>Trạng thái</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {videos.map((video) =>
          video.roleAssignments.map((assignment) => {
            const latestViews = video.viewsLog[0];
            return (
              <TableRow key={assignment.id}>
                <TableCell>
                  <VideoThumbnail
                    src={video.thumbnailUrl}
                    alt={video.title}
                  />
                </TableCell>
                <TableCell>
                  <div className="max-w-xs">
                    <p className="font-medium text-zinc-900 line-clamp-2 text-sm">
                      <Link
                        href={`https://youtube.com/watch?v=${video.youtubeVideoId}`}
                        target="_blank"
                        className="hover:underline"
                      >
                        {video.title}
                      </Link>
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
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {assignment.user.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {assignment.user.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={assignment.role} />
                </TableCell>
                <TableCell className="text-right text-zinc-600 text-sm">
                  {latestViews
                    ? Number(latestViews.viewsCount).toLocaleString("vi-VN")
                    : "—"}
                </TableCell>
                {showActions ? (
                  <TableCell>
                    <ApproveButton
                      videoId={video.id}
                      assignmentId={assignment.id}
                      currentStatus={assignment.status}
                    />
                  </TableCell>
                ) : (
                  <TableCell>
                    <AssignmentStatusBadge status={assignment.status} />
                  </TableCell>
                )}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

export default async function DirectorVideosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("DIRECTOR");

  const activeTab = searchParams.tab ?? "pending";

  const [pendingVideos, approvedVideos, rejectedVideos] = await Promise.all([
    getVideosByStatus("PENDING"),
    getVideosByStatus("APPROVED"),
    getVideosByStatus("REJECTED"),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Video className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Quản lý Video</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="pending" asChild>
            <Link href="/director/videos?tab=pending">
              Chờ duyệt{" "}
              {pendingVideos.flatMap((v) => v.roleAssignments).length > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 font-semibold">
                  {pendingVideos.flatMap((v) => v.roleAssignments).length}
                </span>
              )}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="approved" asChild>
            <Link href="/director/videos?tab=approved">Đã duyệt</Link>
          </TabsTrigger>
          <TabsTrigger value="rejected" asChild>
            <Link href="/director/videos?tab=rejected">Từ chối</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              <VideoTable videos={pendingVideos} showActions />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardContent className="p-0">
              <VideoTable videos={approvedVideos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardContent className="p-0">
              <VideoTable videos={rejectedVideos} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
