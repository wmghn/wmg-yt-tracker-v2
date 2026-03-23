export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Metric, UserRole } from "@prisma/client";

const ALL_METRICS: Metric[] = ["REVENUE", "VIEWS", "CPM", "RPM", "IMPRESSIONS"];

export async function GET() {
  try {
    await requireRole("DIRECTOR");

    const configs = await db.permissionConfig.findMany();
    const matrix: Record<string, string[]> = {};

    // Default: all metrics locked to DIRECTOR only if no config exists
    for (const m of ALL_METRICS) {
      matrix[m] = ["DIRECTOR"];
    }
    for (const c of configs) {
      matrix[c.metric] = c.allowedRoles;
    }

    return NextResponse.json(matrix);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/permissions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRole("DIRECTOR");
    const userId = session.user?.id as string;

    const body = await req.json();
    const configs: { metric: Metric; allowedRoles: string[] }[] = body.configs;

    if (!Array.isArray(configs)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const validRoles = new Set<string>(["DIRECTOR", "MANAGER", "STAFF"]);
    const results = await Promise.all(
      configs.map((c) => {
        // Director is always included, filter to valid UserRole values
        const roles = Array.from(
          new Set(["DIRECTOR", ...c.allowedRoles.filter((r) => validRoles.has(r))])
        ) as UserRole[];
        return db.permissionConfig.upsert({
          where: { metric: c.metric },
          create: {
            metric: c.metric,
            allowedRoles: roles,
            createdBy: userId,
          },
          update: {
            allowedRoles: roles,
          },
        });
      })
    );

    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PUT /api/permissions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
