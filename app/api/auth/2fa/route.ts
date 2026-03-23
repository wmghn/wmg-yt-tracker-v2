export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateTOTPSecret,
  getTOTPUri,
  generateQRCodeDataURL,
  verifyTOTP,
} from "@/lib/totp";

/** Lấy user từ DB bằng email (field chuẩn NextAuth — luôn có trong session) */
async function getSessionUser(session: Awaited<ReturnType<typeof requireAuth>>) {
  const email = session.user?.email ?? "";
  if (!email) throw new Error("UNAUTHORIZED");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

/**
 * GET /api/auth/2fa
 * Tạo secret tạm và trả về QR code để user scan. Chưa lưu vào DB.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const email = session.user?.email ?? "";
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const secret = generateTOTPSecret();
    const uri = getTOTPUri(email, secret);
    const qrCode = await generateQRCodeDataURL(uri);

    return NextResponse.json({ secret, qrCode });
  } catch (err) {
    console.error("[2fa/setup] error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * POST /api/auth/2fa
 * Xác nhận mã TOTP và bật 2FA. Body: { secret, code }
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const user = await getSessionUser(session);

    const { secret, code } = await req.json().catch(() => ({})) as {
      secret?: string;
      code?: string;
    };

    if (!secret || !code) {
      return NextResponse.json({ error: "Thiếu thông tin" }, { status: 400 });
    }

    let valid = false;
    try {
      valid = verifyTOTP(code.replace(/\s/g, ""), secret);
    } catch (totpErr) {
      console.error("[2fa/enable] verifyTOTP threw:", totpErr);
      return NextResponse.json({ error: "Lỗi xác thực mã TOTP" }, { status: 500 });
    }

    if (!valid) {
      return NextResponse.json({ error: "Mã xác thực không đúng" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[2fa/enable] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/2fa
 * Tắt 2FA. Body: { password }
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireAuth();
    const user = await getSessionUser(session);

    const { password } = await req.json().catch(() => ({})) as { password?: string };
    if (!password) {
      return NextResponse.json({ error: "Vui lòng nhập mật khẩu để xác nhận" }, { status: 400 });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[2fa/disable] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
