export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/auth/2fa/check
 * Kiểm tra email có bật 2FA không (dùng ở trang login để hiện ô mã TOTP).
 * Không xác thực mật khẩu — chỉ trả boolean để điều khiển UI.
 * Body: { email }
 */
export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({})) as { email?: string };
    if (!email) return NextResponse.json({ requires2FA: false });

    type Row = { twoFactorEnabled: boolean };
    const rows = await db.$queryRaw<Row[]>`
      SELECT "twoFactorEnabled" FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;

    return NextResponse.json({ requires2FA: rows[0]?.twoFactorEnabled ?? false });
  } catch {
    return NextResponse.json({ requires2FA: false });
  }
}
