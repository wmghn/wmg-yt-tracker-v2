export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/users/[id]/password
 *
 * Body: { newPassword: string, currentPassword?: string }
 *
 * Quy tắc:
 *   - Đổi mật khẩu của chính mình → phải cung cấp currentPassword
 *   - DIRECTOR đổi mật khẩu người khác (non-DIRECTOR) → không cần currentPassword
 *   - MANAGER đổi mật khẩu STAFF thuộc kênh mình quản lý → không cần currentPassword
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    const callerId = (session.user as { id?: string }).id ?? "";
    const callerRole = (session.user as { role?: string }).role ?? "";

    const body = await req.json().catch(() => ({}));
    const { newPassword, currentPassword } = body as {
      newPassword?: string;
      currentPassword?: string;
    };

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "Mật khẩu mới tối thiểu 6 ký tự" }, { status: 400 });
    }

    const targetId = params.id;
    const isSelf = callerId === targetId;

    // Lấy thông tin user cần đổi mật khẩu
    type UserRow = { id: string; role: string; password: string };
    const rows = await db.$queryRaw<UserRow[]>`
      SELECT id, role, password FROM users WHERE id = ${targetId} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Người dùng không tồn tại" }, { status: 404 });
    }

    const target = rows[0];

    // Không cho phép đổi mật khẩu DIRECTOR (trừ chính họ tự đổi)
    if (target.role === "DIRECTOR" && !isSelf) {
      return NextResponse.json({ error: "Không thể đổi mật khẩu Director khác" }, { status: 403 });
    }

    // Đổi mật khẩu chính mình → phải xác nhận mật khẩu hiện tại
    if (isSelf) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Vui lòng nhập mật khẩu hiện tại" }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, target.password);
      if (!valid) {
        return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 400 });
      }
    } else {
      // Đổi mật khẩu người khác → kiểm tra quyền
      if (callerRole === "MANAGER") {
        // Manager chỉ được đổi mật khẩu STAFF thuộc kênh mình quản lý
        if (target.role !== "STAFF") {
          return NextResponse.json({ error: "Quản lý chỉ được đổi mật khẩu nhân viên" }, { status: 403 });
        }

        type CountRow = { count: bigint };
        const managed = await db.$queryRaw<CountRow[]>`
          SELECT COUNT(*) as count
          FROM channel_members cm
          JOIN channels c ON c.id = cm."channelId"
          WHERE c."managerId" = ${callerId}
            AND cm."userId" = ${targetId}`;

        if (Number(managed[0]?.count ?? 0) === 0) {
          return NextResponse.json(
            { error: "Nhân viên này không thuộc kênh bạn quản lý" },
            { status: 403 }
          );
        }
      }
      // DIRECTOR không cần kiểm tra thêm
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.$executeRaw`
      UPDATE users SET password = ${hashed}, "updatedAt" = NOW()
      WHERE id = ${targetId}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/users/[id]/password]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
