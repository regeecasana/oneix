import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session.js";

const secret = "s".repeat(32);
const payload = { sub: "user_1", tid: "default", exp: 2_000 };

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    expect(verifySession(signSession(payload, secret), secret, 1_000)).toEqual(payload);
  });

  it("rejects an expired token", () => {
    expect(verifySession(signSession(payload, secret), secret, 2_000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession(payload, "x".repeat(32)), secret, 1_000)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [, signature] = signSession(payload, secret).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, sub: "admin" })).toString("base64url");
    expect(verifySession(`${forged}.${signature}`, secret, 1_000)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySession("not-a-token", secret)).toBeNull();
  });
});
