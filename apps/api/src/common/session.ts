import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "oneix_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionPayload {
  /** User ID */
  sub: string;
  /** Tenant ID */
  tid: string;
  /** Expiry, epoch milliseconds */
  exp: number;
}

/** A signed, stateless session token: base64url(payload).base64url(hmac). */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.tid !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
