import { NextResponse } from "next/server";
import { requireRole, getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: periodId } = await params;
    const userRole = (session.user as { role: string }).role;
    const userId = session.user.id;

    // Verify period exists
    const period = await db.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });
    }

    if (userRole === "DIRECTOR") {
      // Director: all records with user info
      const records = await db.payrollRecord.findMany({
        where: { periodId },
        orderBy: { totalSalary: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      return NextResponse.json(
        records.map((r) => ({
          ...r,
          totalViews: Number(r.totalViews),
          baseSalary: r.baseSalary.toFixed(2),
          totalBonus: r.totalBonus.toFixed(2),
          totalSalary: r.totalSalary.toFixed(2),
        }))
      );
    }

    if (userRole === "MANAGER") {
      // Manager: only records for users in their channels
      const managedChannels = await db.channel.findMany({
        where: { managerId: userId },
        select: { id: true },
      });

      const channelIds = managedChannels.map((c) => c.id);

      // Get member userIds in those channels
      const members = await db.channelMember.findMany({
        where: { channelId: { in: channelIds } },
        select: { userId: true },
      });

      const memberUserIds = Array.from(new Set(members.map((m) => m.userId)));

      const records = await db.payrollRecord.findMany({
        where: {
          periodId,
          userId: { in: memberUserIds },
        },
        orderBy: { totalSalary: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      return NextResponse.json(
        records.map((r) => ({
          ...r,
          totalViews: Number(r.totalViews),
          baseSalary: r.baseSalary.toFixed(2),
          totalBonus: r.totalBonus.toFixed(2),
          totalSalary: r.totalSalary.toFixed(2),
        }))
      );
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (error) {
    console.error("[GET /api/payroll/periods/[id]/records]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
