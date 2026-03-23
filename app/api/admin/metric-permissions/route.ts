export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

export async function GET() {
  try {
    await requireRole("DIRECTOR");
    const perms = await db.metricPermission.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json(perms);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRole("DIRECTOR");
    const userId = session.user?.id as string;
    const body = await req.json();
    const permissions: { metricKey: string; allowedRoles: string[] }[] = body.permissions;

    if (!Array.isArray(permissions)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const validRoles = new Set<string>(["DIRECTOR", "MANAGER", "STAFF"]);
    const results = await Promise.all(
      permissions.map((p) => {
        const roles = Array.from(
          new Set(["DIRECTOR", ...p.allowedRoles.filter((r) => validRoles.has(r))])
        ) as UserRole[];
        return db.metricPermission.update({
          where: { metricKey: p.metricKey },
          data: { allowedRoles: roles, updatedBy: userId },
        });
      })
    );

    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PUT /api/admin/metric-permissions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
