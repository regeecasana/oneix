import { createHash, randomBytes } from "node:crypto";

/** A random secret for a cookie or a one-time link, and the hash that is stored instead of it. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
