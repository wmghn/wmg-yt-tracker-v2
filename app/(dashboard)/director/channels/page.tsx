import Link from "next/link";
import { Tv2, Eye, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";
import { AddChannelDialog } from "@/components/channels/add-channel-dialog";

type SearchParams = {
  status?: string;
  search?: string;
  page?: string;
};

export default async function DirectorChannelsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("DIRECTOR");

  const status = searchParams.status && searchParams.status !== "ALL" ? searchParams.status : undefined;
  const search = searchParams.search ?? undefined;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const [channels, total, managers] = await Promise.all([
    db.channel.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, videos: true } },
      },
    }),
    db.channel.count({ where }),
    db.user.findMany({
      where: { role: "MANAGER", isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tv2 className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Quản lý Kênh</h1>
        </div>
        <AddChannelDialog managers={managers} />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-col sm:flex-row gap-3">
            <Input
              name="search"
              placeholder="Tìm kiếm tên kênh..."
              defaultValue={search ?? ""}
              className="sm:max-w-xs"
            />
            <Select name="status" defaultValue={searchParams.status ?? "ALL"}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                <SelectItem value="PENDING_BKT">Chờ BKT</SelectItem>
                <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                <SelectItem value="INACTIVE">Ngừng</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              Lọc
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên kênh</TableHead>
                <TableHead>YouTube ID</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead className="text-right">Thành viên</TableHead>
                <TableHead className="text-right">Video</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-10">
                    Không tìm thấy kênh nào.
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
                    <TableCell className="text-zinc-500">
                      {channel.manager?.name ?? (
                        <span className="text-zinc-300 italic">Chưa gán</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-zinc-500">
                      {channel._count.members}
                    </TableCell>
                    <TableCell className="text-right text-zinc-500">
                      {channel._count.videos}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link href={`/director/channels/${channel.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link href={`/director/channels/${channel.id}?tab=info`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Hiển thị {skip + 1}–{Math.min(skip + limit, total)} / {total} kênh
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/director/channels?page=${page - 1}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`}
                >
                  Trước
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/director/channels?page=${page + 1}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`}
                >
                  Tiếp
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
