export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOAuthState } from "@/lib/youtube/oauth-state";
import { revokeGoogleToken } from "@/lib/youtube/token";

const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
].join(" ");

/**
 * GET /api/channels/[id]/oauth
 * Initiates OAuth flow — generates a signed state token to prevent CSRF.
 *
 * DELETE /api/channels/[id]/oauth
 * Disconnects the channel's OAuth token, revoking it at Google first.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("DIRECTOR");

    const channel = await db.channel.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/oauth/youtube/callback`;

    if (!clientId) {
      return NextResponse.json({ error: "YouTube OAuth not configured" }, { status: 500 });
    }

    // Signed state — encodes channelId + timestamp + HMAC to prevent CSRF
    const state = createOAuthState(params.id);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl.toString());
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

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("DIRECTOR");

    const channel = await db.channel.findUnique({
      where: { id: params.id },
      select: { id: true, oauthTokenId: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!channel.oauthTokenId) {
      return NextResponse.json({ message: "No token to disconnect" });
    }

    // Fetch refresh token to revoke at Google before deleting locally
    const tokenRecord = await db.youtubeOAuthToken.findUnique({
      where: { id: channel.oauthTokenId },
      select: { refreshToken: true },
    });

    // Revoke at Google (best-effort — do not fail if this errors)
    if (tokenRecord?.refreshToken) {
      await revokeGoogleToken(tokenRecord.refreshToken);
    }

    // Unlink then delete locally
    await db.channel.update({
      where: { id: params.id },
      data: { oauthTokenId: null },
    });
    await db.youtubeOAuthToken.delete({
      where: { id: channel.oauthTokenId },
    });

    return NextResponse.json({ message: "Disconnected" });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
