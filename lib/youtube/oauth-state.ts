import { createHmac, timingSafeEqual } from "crypto";

const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * Creates a signed, time-limited state token for the OAuth flow.
 * Format (base64url): channelId:timestamp:hmac
 *
 * Prevents CSRF attacks — the state cannot be forged without NEXTAUTH_SECRET.
 */
export function createOAuthState(channelId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not configured");

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${channelId}:${timestamp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Verifies the state token and returns the channelId if valid.
 * Returns null if the token is missing, expired, or tampered with.
 */
export function verifyOAuthState(state: string | null): string | null {
  if (!state) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);

    const colonIdx = payload.indexOf(":");
    const channelId = payload.slice(0, colonIdx);
    const timestamp = Number(payload.slice(colonIdx + 1));

    if (!channelId || isNaN(timestamp)) return null;

    // Check expiry
    const age = Math.floor(Date.now() / 1000) - timestamp;
    if (age > STATE_TTL_SECONDS || age < 0) return null;

    // Constant-time HMAC comparison (prevents timing attacks)
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    return channelId;
  } catch {
    return null;
  }
}
