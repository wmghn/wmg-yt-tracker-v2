export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { viewsSnapshotService } from "@/lib/payroll/snapshot";

/**
 * GET /api/cron/sync-views
 *
 * Vercel Cron job endpoint (runs on schedule defined in vercel.json).
 * Secured by the CRON_SECRET environment variable.
 *
 * Vercel injects the Authorization header automatically when the cron fires;
 * for local testing supply:  Authorization: Bearer <CRON_SECRET>
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
  try {
    const result = await viewsSnapshotService.syncAll();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/cron/sync-views]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
