import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.js";

describe("SecretBox", () => {
  const box = new SecretBox(SecretBox.generateKey());

  it("round-trips text and JSON", () => {
    expect(box.decrypt(box.encrypt("hello"))).toBe("hello");
    const credentials = { type: "api_token", email: "a@b.c", apiToken: "secret" };
    expect(box.decryptJson(box.encryptJson(credentials))).toEqual(credentials);
  });

  it("never stores the plaintext and uses a fresh IV each time", () => {
    const a = box.encrypt("secret-token");
    const b = box.encrypt("secret-token");
    expect(a).not.toContain("secret-token");
    expect(a).not.toBe(b);
  });

  it("rejects values encrypted with another key", () => {
    const other = new SecretBox(SecretBox.generateKey());
    expect(() => box.decrypt(other.encrypt("x"))).toThrow();
  });

  it("rejects tampered values", () => {
    const [version, iv, tag, ciphertext] = box.encrypt("hello").split(".");
    const flipped = Buffer.from(ciphertext!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => box.decrypt([version, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString("base64"))).toThrow("32 bytes");
  });
});
