export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/analytics/sync/status?jobId=xxx
 * Trả về trạng thái hiện tại của một SyncJob.
 * Client poll endpoint này sau khi POST /api/analytics/sync trả về jobId.
 */
export async function GET(req: Request) {
  try {
    await requireRole(["DIRECTOR", "MANAGER"]);

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const job = await db.syncJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, result: true, createdAt: true, updatedAt: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
