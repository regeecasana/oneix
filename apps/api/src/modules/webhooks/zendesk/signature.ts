import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zendesk signs webhooks as base64(HMAC-SHA256(timestamp + rawBody, signingSecret)).
 */
export function verifyZendeskSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !timestamp) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(timestamp).update(rawBody).digest("base64"),
  );
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
