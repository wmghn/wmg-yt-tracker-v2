export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/cron/channels
 * Trả về tất cả kênh ACTIVE + trạng thái cron enabled/disabled từng kênh
 */
export async function GET() {
  try {
    await requireRole("DIRECTOR");

    const [channels, cronConfigs] = await Promise.all([
      db.channel.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.cronChannelConfig.findMany({ select: { channelId: true, enabled: true } }),
    ]);

    const configMap = new Map(cronConfigs.map((c) => [c.channelId, c.enabled]));

    return NextResponse.json({
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        enabled: configMap.get(ch.id) ?? true, // mặc định: enabled
      })),
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/cron/channels
 * Body: { channelId: string, enabled: boolean }
 */
export async function PUT(req: Request) {
  try {
    await requireRole("DIRECTOR");
    const body = await req.json().catch(() => ({}));
    const { channelId, enabled } = body as { channelId: string; enabled: boolean };

    if (!channelId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await db.cronChannelConfig.upsert({
      where: { channelId },
      create: { channelId, enabled },
      update: { enabled },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
