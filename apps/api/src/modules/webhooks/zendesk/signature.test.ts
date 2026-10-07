import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyZendeskSignature } from "./signature.js";

const secret = "webhook-secret";
const timestamp = "2026-10-07T10:00:00Z";
const body = Buffer.from('{"ticket_id":"1001","updated_at":"2026-10-07T10:00:00Z"}');
const signature = createHmac("sha256", secret).update(timestamp + body.toString()).digest("base64");

describe("verifyZendeskSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyZendeskSignature(body, signature, timestamp, secret)).toBe(true);
  });

  it("rejects a modified body", () => {
    expect(verifyZendeskSignature(Buffer.from(`${body} `), signature, timestamp, secret)).toBe(false);
  });

  it("rejects a different timestamp", () => {
    expect(verifyZendeskSignature(body, signature, "2026-10-07T10:00:01Z", secret)).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifyZendeskSignature(body, undefined, timestamp, secret)).toBe(false);
    expect(verifyZendeskSignature(undefined, signature, timestamp, secret)).toBe(false);
  });
});
