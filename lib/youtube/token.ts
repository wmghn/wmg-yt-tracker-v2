import { db } from "@/lib/db";
import { encrypt, safeDecrypt } from "@/lib/crypto";

/**
 * Returns a valid access token for the given channel.
 * Automatically refreshes if the stored token is expired (or expires within 60s).
 * Returns null if the channel has no OAuth token configured.
 */
export async function getValidAccessToken(channelId: string): Promise<string | null> {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: {
      oauthToken: {
        select: {
          id: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      },
    },
  });

  const token = channel?.oauthToken;
  if (!token) return null;

  const accessToken = safeDecrypt(token.accessToken);
  const refreshToken = safeDecrypt(token.refreshToken);

  // Still valid with 60-second buffer
  const bufferMs = 60 * 1000;
  if (token.expiresAt.getTime() - Date.now() > bufferMs) {
    return accessToken;
  }

  // Token expired — refresh it
  return refreshAccessToken(token.id, refreshToken);
}

async function refreshAccessToken(tokenId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  try {
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
      console.error(`[refreshAccessToken] Google token refresh failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await db.youtubeOAuthToken.update({
      where: { id: tokenId },
      data: { accessToken: encrypt(newAccessToken), expiresAt: newExpiresAt },
    });

    return newAccessToken;
  } catch (err) {
    console.error(`[refreshAccessToken] Error refreshing token ${tokenId}:`, err);
    return null;
  }
}

/**
 * Revokes a token at Google's servers (best-effort).
 * Should be called before deleting a token from the database.
 */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
  } catch {
    // Best-effort — proceed with local deletion even if revocation fails
  }
}
