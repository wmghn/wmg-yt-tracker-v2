export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/users/me — trả về thông tin user đang đăng nhập
 * Dùng email (field chuẩn NextAuth) để lookup DB thay vì id
 * vì session.user.id có thể undefined trong một số cấu hình NextAuth v5
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const email = session.user?.email ?? "";
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, twoFactorEnabled: true },
    });

    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      id: dbUser.id,
      name: dbUser.name,
      email,
      role: dbUser.role,
      twoFactorEnabled: dbUser.twoFactorEnabled === true,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
