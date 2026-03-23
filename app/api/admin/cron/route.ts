export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

const DEFAULT_CONFIG = {
  enabled: true,
  frequency: "daily",
  runHour: 2,
  dateRange: "month",
};

/**
 * GET /api/admin/cron — đọc config cron toàn cục
 */
export async function GET() {
  try {
    await requireRole("DIRECTOR");
    const config = await db.cronConfig.findUnique({ where: { id: "singleton" } });
    return NextResponse.json(config ?? { id: "singleton", ...DEFAULT_CONFIG, lastRunAt: null, lastResult: null });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/cron — cập nhật config cron toàn cục
 */
export async function PUT(req: Request) {
  try {
    const session = await requireRole("DIRECTOR");
    const body = await req.json().catch(() => ({}));
    const { enabled, frequency, runHour, dateRange } = body;

    const config = await db.cronConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        enabled: enabled ?? DEFAULT_CONFIG.enabled,
        frequency: frequency ?? DEFAULT_CONFIG.frequency,
        runHour: runHour ?? DEFAULT_CONFIG.runHour,
        dateRange: dateRange ?? DEFAULT_CONFIG.dateRange,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(frequency !== undefined && { frequency }),
        ...(runHour !== undefined && { runHour }),
        ...(dateRange !== undefined && { dateRange }),
      },
    });

    console.log(`[cron-config] Updated by ${(session.user as { email?: string }).email}:`, { enabled, frequency, runHour, dateRange });
    return NextResponse.json(config);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
