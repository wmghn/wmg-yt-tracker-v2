export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { viewsSnapshotService } from "@/lib/payroll/snapshot";

/**
 * GET /api/views/sync
 *
 * Cron-job endpoint secured by a shared secret.
 * Callers must supply the header:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Run sync ──────────────────────────────────────────────────────────────
  const start = Date.now();

  try {
    const result = await viewsSnapshotService.syncAll();
    const duration = Date.now() - start;

    return NextResponse.json({ ...result, duration });
  } catch (err) {
    console.error("[GET /api/views/sync]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
