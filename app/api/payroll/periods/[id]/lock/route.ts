import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("DIRECTOR");
    const { id: periodId } = await params;

    // Verify period exists
    const period = await db.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { _count: { select: { records: true } } },
    });

    if (!period) {
      return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });
    }

    // Already locked
    if (period.lockedAt) {
      return NextResponse.json(
        { error: "Kỳ lương đã được lock" },
        { status: 400 }
      );
    }

    // Must have records first
    if (period._count.records === 0) {
      return NextResponse.json(
        { error: "Phải tính lương trước khi lock kỳ" },
        { status: 400 }
      );
    }

    const updated = await db.payrollPeriod.update({
      where: { id: periodId },
      data: {
        lockedAt: new Date(),
        lockedBy: session.user.id,
      },
    });

    revalidatePath("/director/payroll");

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (error.message === "FORBIDDEN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[POST /api/payroll/periods/[id]/lock]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
