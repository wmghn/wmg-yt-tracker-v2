import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/users/[id] — update role or isActive
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    const callerRole = (session.user as { role?: string })?.role;

    const body = await req.json();

    type UserRow = { id: string; role: string };
    const rows = await db.$queryRaw<UserRow[]>`
      SELECT id, role FROM users WHERE id = ${params.id} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Người dùng không tồn tại" }, { status: 404 });
    }
    if (rows[0].role === "DIRECTOR") {
      return NextResponse.json({ error: "Không thể sửa Director" }, { status: 403 });
    }

    if (body.role !== undefined) {
      // Manager cannot change roles
      if (callerRole !== "DIRECTOR") {
        return NextResponse.json({ error: "Không có quyền thay đổi role" }, { status: 403 });
      }
      if (!["MANAGER", "STAFF"].includes(body.role)) {
        return NextResponse.json({ error: "Role không hợp lệ" }, { status: 400 });
      }
      await db.$executeRaw`
        UPDATE users SET role = ${body.role}::"UserRole", "updatedAt" = NOW()
        WHERE id = ${params.id}`;
    }

    if (body.isActive !== undefined) {
      await db.$executeRaw`
        UPDATE users SET "isActive" = ${body.isActive}, "updatedAt" = NOW()
        WHERE id = ${params.id}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
