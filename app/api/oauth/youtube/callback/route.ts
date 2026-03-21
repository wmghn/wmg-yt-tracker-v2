import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyOAuthState } from "@/lib/youtube/oauth-state";

/**
 * GET /api/oauth/youtube/callback?code=...&state=<signed>
 *
 * Google redirects here after the user grants consent.
 * - Verifies the signed HMAC state to prevent CSRF.
 * - Exchanges the authorization code for access + refresh tokens.
 * - Upserts a YoutubeOAuthToken record.
 * - Links the token to the channel.
 * - Redirects to the channel detail page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const fallbackRedirect = `${baseUrl}/director/channels`;

  // User denied consent
  if (errorParam) {
    const channelId = verifyOAuthState(stateParam);
    const redirectBase = channelId
      ? `${baseUrl}/director/channels/${channelId}`
      : fallbackRedirect;
    return NextResponse.redirect(
      `${redirectBase}?tab=oauth&error=${encodeURIComponent(errorParam)}`
    );
  }

  // Verify HMAC-signed state — prevents CSRF
  const channelId = verifyOAuthState(stateParam);
  if (!channelId || !code) {
    return NextResponse.redirect(`${fallbackRedirect}?error=invalid_state`);
  }

  const redirectBase = `${baseUrl}/director/channels/${channelId}`;

  // Must be a logged-in user
  try {
    await requireAuth();
  } catch {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = `${baseUrl}/api/oauth/youtube/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${redirectBase}?tab=oauth&error=server_config`);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      // Do not log the error body — it may contain partial token data
      return NextResponse.redirect(`${redirectBase}?tab=oauth&error=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expiresIn: number = tokenData.expires_in ?? 3600;
    const scope: string = tokenData.scope ?? "";
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    if (!refreshToken) {
      // User had already granted access without revoking — no refresh token issued.
      return NextResponse.redirect(
        `${redirectBase}?tab=oauth&error=no_refresh_token`
      );
    }

    // Validate channel exists
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      select: { id: true, oauthTokenId: true },
    });
    if (!channel) {
      return NextResponse.redirect(`${redirectBase}?tab=oauth&error=channel_not_found`);
    }

    // Fetch the authorized YouTube channel name and ID (best-effort)
    let ytChannelId: string | null = null;
    let ytChannelName: string | null = null;
    try {
      const ytRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const item = ytData.items?.[0];
        if (item) {
          ytChannelId = item.id as string;
          ytChannelName = item.snippet?.title as string ?? null;
        }
      }
    } catch { /* non-fatal */ }

    // Upsert token
    if (channel.oauthTokenId) {
      await db.youtubeOAuthToken.update({
        where: { id: channel.oauthTokenId },
        data: { accessToken, refreshToken, expiresAt, scope, ytChannelId, ytChannelName },
      });
    } else {
      const newToken = await db.youtubeOAuthToken.create({
        data: { channelId, accessToken, refreshToken, expiresAt, scope, ytChannelId, ytChannelName },
      });
      await db.channel.update({
        where: { id: channelId },
        data: { oauthTokenId: newToken.id },
      });
    }

    return NextResponse.redirect(`${redirectBase}?tab=oauth&success=1`);
  } catch {
    // Do not log — catch block may hold token data in scope
    return NextResponse.redirect(`${redirectBase}?tab=oauth&error=internal`);
  }
}
