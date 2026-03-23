export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/client";
import { createPeriodSchema } from "@/lib/validations/payroll";
import { revalidatePath } from "next/cache";

// GET: list all periods with record count and total payroll
export async function GET() {
  try {
    await requireRole("DIRECTOR");

    const periods = await db.payrollPeriod.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        records: {
          select: {
            totalSalary: true,
          },
        },
        creator: { select: { id: true, name: true } },
        locker: { select: { id: true, name: true } },
      },
    });

    const result = periods.map((period) => {
      const totalPayroll = period.records.reduce(
        (sum, r) => sum.add(r.totalSalary),
        new Decimal(0)
      );
      return {
        id: period.id,
        month: period.month,
        year: period.year,
        lockedAt: period.lockedAt,
        lockedBy: period.lockedBy,
        createdBy: period.createdBy,
        createdAt: period.createdAt,
        creator: period.creator,
        locker: period.locker,
        recordCount: period.records.length,
        totalPayroll: totalPayroll.toFixed(2),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (error.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: create new period
export async function POST(request: Request) {
  try {
    const session = await requireRole("DIRECTOR");

    const body = await request.json();
    const parsed = createPeriodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { month, year } = parsed.data;

    // Check duplicate
    const existing = await db.payrollPeriod.findUnique({
      where: { month_year: { month, year } },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Kỳ lương tháng ${month}/${year} đã tồn tại` },
        { status: 409 }
      );
    }

    const period = await db.payrollPeriod.create({
      data: {
        month,
        year,
        createdBy: session.user.id,
      },
    });

    revalidatePath("/director/payroll");

    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (error.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
