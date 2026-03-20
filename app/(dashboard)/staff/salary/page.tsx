import { Wallet, TrendingUp, Video } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { payrollCalculator } from "@/lib/payroll/calculator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StaffSalaryPage() {
  const session = await requireRole("STAFF");
  const userId = session.user.id;

  const [records, preview, approvedCount] = await Promise.all([
    db.payrollRecord.findMany({
      where: { userId },
      orderBy: [
        { period: { year: "desc" } },
        { period: { month: "desc" } },
      ],
      include: {
        period: {
          select: { id: true, month: true, year: true, lockedAt: true },
        },
      },
    }),
    payrollCalculator.preview(userId),
    db.videoRoleAssignment.count({
      where: {
        userId,
        status: "APPROVED",
        video: {
          isActive: true,
          channel: { status: "ACTIVE" },
        },
      },
    }),
  ]);

  const currentSalary = Number(preview.totalSalary);
  const currentBonus = Number(preview.totalBonus);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Lương của tôi</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Lương tháng này (dự kiến)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-zinc-900">
              {currentSalary.toLocaleString("vi-VN")} đ
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Lương cứng:{" "}
              {Number(preview.baseSalary).toLocaleString("vi-VN")} đ
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Thưởng dự kiến
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {currentBonus.toLocaleString("vi-VN")} đ
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {preview.totalViews.toLocaleString("vi-VN")} views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
              <Video className="h-4 w-4" />
              Video được duyệt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-zinc-900">{approvedCount}</p>
            <p className="text-xs text-zinc-400 mt-1">
              Assignment đang hoạt động
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Salary history table */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          Lịch sử lương
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kỳ lương</TableHead>
                  <TableHead className="text-right">Lương cứng</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Thưởng</TableHead>
                  <TableHead className="text-right">Tổng lương</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-zinc-500 py-10"
                    >
                      Chưa có dữ liệu lương.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        Tháng {record.period.month}/{record.period.year}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {record.baseSalary.toNumber().toLocaleString("vi-VN")} đ
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {Number(record.totalViews).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {record.totalBonus.toNumber().toLocaleString("vi-VN")} đ
                      </TableCell>
                      <TableCell className="text-right font-semibold text-zinc-900">
                        {record.totalSalary.toNumber().toLocaleString("vi-VN")} đ
                      </TableCell>
                      <TableCell>
                        {record.period.lockedAt ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Đã lock
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                            Tạm tính
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
