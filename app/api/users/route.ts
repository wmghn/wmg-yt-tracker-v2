export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// GET /api/users — list all non-director users
export async function GET() {
  try {
    await requireRole(["DIRECTOR", "MANAGER"]);

    type UserRow = {
      id: string;
      name: string;
      email: string;
      role: string;
      isActive: boolean;
      twoFactorEnabled: boolean;
      createdAt: Date;
    };

    const users: UserRow[] = await db.$queryRaw`
      SELECT id, name, email, role, "isActive", "twoFactorEnabled", "createdAt"
      FROM users
      WHERE role != 'DIRECTOR'
      ORDER BY "createdAt" DESC`;

    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/users — create new manager or staff
export async function POST(req: Request) {
  try {
    const session = await requireRole(["DIRECTOR", "MANAGER"]);
    const callerRole = (session.user as { role?: string })?.role;

    const body = await req.json();
    const name: string = (body.name ?? "").trim();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const password: string = body.password ?? "";
    const role: string = body.role ?? "";

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }
    // Manager can only create STAFF
    const allowedRoles = callerRole === "DIRECTOR" ? ["MANAGER", "STAFF"] : ["STAFF"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Không có quyền tạo role này" }, { status: 403 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu tối thiểu 6 ký tự" }, { status: 400 });
    }

    // Check email unique
    type ExRow = { id: string };
    const existing = await db.$queryRaw<ExRow[]>`
      SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email đã được sử dụng" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);

    type CreatedRow = { id: string; name: string; email: string; role: string };
    const created = await db.$queryRaw<CreatedRow[]>`
      INSERT INTO users (id, name, email, password, role, "baseSalary", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${name}, ${email}, ${hashed}, ${role}::"UserRole", 0, true, NOW(), NOW())
      RETURNING id, name, email, role`;

    return NextResponse.json({ user: created[0] }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
