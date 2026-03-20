import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireAuth();
    const userRole = (session.user as { role?: string }).role ?? "";

    const allMetrics = await db.metricPermission.findMany({
      orderBy: { sortOrder: "asc" },
    });

    const allowed = allMetrics.filter((m) => (m.allowedRoles as string[]).includes(userRole));

    return NextResponse.json(allowed);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
