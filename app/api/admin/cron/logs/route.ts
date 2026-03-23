export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/cron/logs
 * Trả về 50 log gần nhất (tự động xoá log > 7 ngày khi được gọi)
 */
export async function GET() {
  try {
    await requireRole("DIRECTOR");

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Xoá log cũ và lấy log mới song song
    const [, logs] = await Promise.all([
      db.cronLog.deleteMany({ where: { runAt: { lt: cutoff } } }),
      db.cronLog.findMany({
        orderBy: { runAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({ logs });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
