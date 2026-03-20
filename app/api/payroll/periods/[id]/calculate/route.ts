import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { payrollCalculator } from "@/lib/payroll/calculator";
import { Decimal } from "@prisma/client/runtime/client";
import { revalidatePath } from "next/cache";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("DIRECTOR");
    const { id: periodId } = await params;

    // Verify period exists
    const period = await db.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });
    }

    // Check period is not locked
    if (period.lockedAt) {
      return NextResponse.json(
        { error: "Kỳ lương đã được lock, không thể tính lại" },
        { status: 400 }
      );
    }

    const records = await payrollCalculator.calculateAll(periodId);

    const totalPayroll = records.reduce(
      (sum, r) => sum.add(r.totalSalary),
      new Decimal(0)
    );

    revalidatePath("/director/payroll");

    return NextResponse.json({
      calculated: records.length,
      totalPayroll: totalPayroll.toFixed(2),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (error.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[POST /api/payroll/periods/[id]/calculate]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
