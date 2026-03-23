export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getDbProvider } from "@/lib/db";

/**
 * GET /api/admin/db-provider
 * Trả về thông tin DB provider đang dùng (chỉ DIRECTOR)
 */
export async function GET() {
  try {
    await requireRole(["DIRECTOR"]);
    const provider = getDbProvider();
    return NextResponse.json({
      provider,
      label: provider === "sqlite" ? "SQLite (Local)" : "PostgreSQL (Supabase)",
      isLocal: provider === "sqlite",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
