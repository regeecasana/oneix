import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password.js";
import { hashToken, newToken } from "./tokens.js";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("anything at all", "not-a-hash")).toBe(false);
  });

  it("asks for long passwords that don't contain the email name", () => {
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("sam.agent-2026-secure", "sam.agent@example.com")).toMatch(/email/);
    expect(passwordProblem("a long enough passphrase", "sam@example.com")).toBeNull();
  });
});

describe("tokens", () => {
  it("are random and stored only as a hash", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});
