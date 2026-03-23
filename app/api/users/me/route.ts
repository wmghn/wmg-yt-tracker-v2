export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/users/me — trả về thông tin user đang đăng nhập
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const u = session.user as { id?: string; name?: string; email?: string; role?: string };
    return NextResponse.json({
      id: u.id ?? "",
      name: u.name ?? "",
      email: u.email ?? "",
      role: u.role ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
