export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/channels/[id]/tracker
 * Trả về danh sách nhân sự + video IDs đã lưu trong DB cho View Tracker.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const channelId = params.id;

    const config = await db.channelTrackerConfig.findUnique({
      where: { channelId },
      select: { data: true, updatedAt: true },
    });

    return NextResponse.json({
      data: config?.data ?? [],
      updatedAt: config?.updatedAt ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/channels/[id]/tracker
 * Lưu danh sách nhân sự + video IDs vào DB (upsert).
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const channelId = params.id;
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? [];

    await db.channelTrackerConfig.upsert({
      where: { channelId },
      create: { channelId, data },
      update: { data },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
