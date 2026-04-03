export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, safeDecrypt } from "@/lib/crypto";

/**
 * POST /api/channels/[id]/oauth/refresh
 * Manually refresh the access token for a channel using its stored refresh token.
 * Returns the new expiresAt timestamp on success.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("DIRECTOR");

    const channel = await db.channel.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, oauthTokenId: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!channel.oauthTokenId) {
      return NextResponse.json(
        { error: "Kênh chưa kết nối OAuth" },
        { status: 400 }
      );
    }

    const tokenRecord = await db.youtubeOAuthToken.findUnique({
      where: { id: channel.oauthTokenId },
      select: { id: true, refreshToken: true },
    });

    if (!tokenRecord?.refreshToken) {
      return NextResponse.json(
        { error: "Không tìm thấy refresh token" },
        { status: 400 }
      );
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Server chưa cấu hình YouTube OAuth credentials" },
        { status: 500 }
      );
    }

    const refreshToken = safeDecrypt(tokenRecord.refreshToken);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(
        `[oauth/refresh] Google token refresh failed for channel "${channel.name}": ${res.status} — ${errorBody}`
      );

      // Parse Google error for user-friendly message
      let detail = "Google từ chối làm mới token.";
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error === "invalid_grant") {
          detail =
            "Refresh token đã hết hạn hoặc bị thu hồi. Vui lòng nhấn \"Kết nối lại\" để cấp quyền mới.";
        } else if (parsed.error_description) {
          detail = parsed.error_description;
        }
      } catch {
        // keep default detail
      }

      return NextResponse.json(
        { error: detail, googleStatus: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await db.youtubeOAuthToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: encrypt(newAccessToken),
        expiresAt: newExpiresAt,
      },
    });

    return NextResponse.json({
      message: "Token đã được làm mới thành công",
      expiresAt: newExpiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[oauth/refresh] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
