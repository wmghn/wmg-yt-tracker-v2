export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { weightConfigSchema } from "@/lib/validations/channel";

type Params = { params: { id: string } };

// GET /api/channels/[id]/weights
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = params;
    const now = new Date();

    // Get latest effective config for each role (effectiveFrom <= now)
    const configs = await db.channelWeightConfig.findMany({
      where: {
        channelId,
        effectiveFrom: { lte: now },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    // Get latest config per role
    const latestByRole: Record<string, (typeof configs)[0]> = {};
    for (const config of configs) {
      if (!latestByRole[config.role]) {
        latestByRole[config.role] = config;
      }
    }

    return NextResponse.json(Object.values(latestByRole));
  } catch (err) {
    console.error("[GET /api/channels/[id]/weights]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/channels/[id]/weights — MANAGER of channel or DIRECTOR
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = params;
    const role = session.user.role;
    const currentUserId = session.user.id;

    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: "Kênh không tồn tại" }, { status: 404 });
    }

    // Check permission: DIRECTOR or MANAGER who manages this channel
    if (role !== "DIRECTOR") {
      if (role !== "MANAGER" || channel.managerId !== currentUserId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = weightConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    }

    const { configs } = parsed.data;
    const effectiveFrom = new Date();

    const created = await db.$transaction(
      configs.map((cfg) =>
        db.channelWeightConfig.create({
          data: {
            channelId,
            role: cfg.role,
            weightPercent: cfg.weightPercent,
            effectiveFrom,
            createdBy: currentUserId,
          },
        })
      )
    );

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/channels/[id]/weights]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
