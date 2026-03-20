import Link from "next/link";
import { DollarSign, Eye } from "lucide-react";
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
import { CreatePeriodDialog } from "@/components/payroll/create-period-dialog";
import { CalculateButton } from "@/components/payroll/calculate-button";
import { LockButton } from "@/components/payroll/lock-button";

export default async function DirectorPayrollPage() {
  await requireRole("DIRECTOR");

  const periods = await db.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      records: {
        select: { totalSalary: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Bảng lương</h1>
        </div>
        <CreatePeriodDialog />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kỳ lương</TableHead>
                <TableHead className="text-right">Số nhân sự</TableHead>
                <TableHead className="text-right">Tổng lương</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-zinc-500 py-10"
                  >
                    Chưa có kỳ lương nào. Tạo kỳ lương đầu tiên.
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((period) => {
                  const totalPayroll = period.records.reduce(
                    (sum, r) => sum.add(r.totalSalary),
                    new Decimal(0)
                  );
                  const isLocked = !!period.lockedAt;
                  const hasRecords = period.records.length > 0;
                  const periodLabel = `Tháng ${period.month}/${period.year}`;

                  return (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {periodLabel}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {period.records.length}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {hasRecords
                          ? totalPayroll.toNumber().toLocaleString("vi-VN") + " đ"
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {isLocked ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Đã lock
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                            Chưa lock
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!isLocked && (
                            <CalculateButton
                              periodId={period.id}
                              periodLabel={periodLabel}
                            />
                          )}
                          {!isLocked && hasRecords && (
                            <LockButton
                              periodId={period.id}
                              periodLabel={periodLabel}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            asChild
                          >
                            <Link href={`/director/payroll/${period.id}`}>
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Xem
                            </Link>
                          </Button>
                        </div>
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
