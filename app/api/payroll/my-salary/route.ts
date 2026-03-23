export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireRole("STAFF");
    const userId = session.user.id;

    const records = await db.payrollRecord.findMany({
      where: { userId },
      orderBy: [
        { period: { year: "desc" } },
        { period: { month: "desc" } },
      ],
      include: {
        period: {
          select: {
            id: true,
            month: true,
            year: true,
            lockedAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      records.map((r) => ({
        id: r.id,
        periodId: r.periodId,
        userId: r.userId,
        baseSalary: r.baseSalary.toFixed(2),
        totalViews: Number(r.totalViews),
        totalBonus: r.totalBonus.toFixed(2),
        totalSalary: r.totalSalary.toFixed(2),
        calculatedAt: r.calculatedAt,
        detail: r.detail,
        createdAt: r.createdAt,
        period: r.period,
      }))
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (error.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[GET /api/payroll/my-salary]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
