import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LockButton } from "@/components/payroll/lock-button";
import { CalculateButton } from "@/components/payroll/calculate-button";

export default async function PayrollPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("DIRECTOR");
  const { id: periodId } = await params;

  const period = await db.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      records: {
        orderBy: { totalSalary: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!period) notFound();

  const isLocked = !!period.lockedAt;
  const hasRecords = period.records.length > 0;
  const periodLabel = `Tháng ${period.month}/${period.year}`;

  const grandTotalViews = period.records.reduce(
    (sum, r) => sum + Number(r.totalViews),
    0
  );
  const grandTotalBonus = period.records.reduce(
    (sum, r) => sum.add(r.totalBonus),
    new Decimal(0)
  );
  const grandTotalSalary = period.records.reduce(
    (sum, r) => sum.add(r.totalSalary),
    new Decimal(0)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/director/payroll">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              Bảng lương {periodLabel}
            </h1>
            <p className="text-sm text-zinc-500">
              {period.records.length} nhân sự
            </p>
          </div>
          {isLocked ? (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              Đã lock
            </Badge>
          ) : (
            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
              Chưa lock
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!isLocked && (
            <CalculateButton periodId={period.id} periodLabel={periodLabel} />
          )}
          {!isLocked && hasRecords && (
            <LockButton periodId={period.id} periodLabel={periodLabel} />
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên nhân sự</TableHead>
                <TableHead className="text-right">Lương cứng</TableHead>
                <TableHead className="text-right">Tổng Views</TableHead>
                <TableHead className="text-right">Thưởng</TableHead>
                <TableHead className="text-right">Tổng lương</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {period.records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-zinc-500 py-10"
                  >
                    Chưa có dữ liệu lương. Nhấn "Tính lương" để tính.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {period.records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-zinc-900">
                            {record.user.name}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {record.user.email}
                          </p>
                        </div>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          asChild
                        >
                          <Link
                            href={`/director/payroll/${periodId}/records/${record.userId}`}
                          >
                            Chi tiết
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total row */}
                  <TableRow className="bg-zinc-50 border-t-2 font-semibold">
                    <TableCell className="text-zinc-700">
                      Tổng cộng ({period.records.length} nhân sự)
                    </TableCell>
                    <TableCell className="text-right text-zinc-700">
                      —
                    </TableCell>
                    <TableCell className="text-right text-zinc-700">
                      {grandTotalViews.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right text-zinc-700">
                      {grandTotalBonus.toNumber().toLocaleString("vi-VN")} đ
                    </TableCell>
                    <TableCell className="text-right text-zinc-900">
                      {grandTotalSalary.toNumber().toLocaleString("vi-VN")} đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
