import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestMatches, gatewaySignatureMatches } from "./sip-auth.js";
import { transcriptLines, transcriptNote } from "./transcript.js";
import { busyMessage } from "./voice-calls.service.js";

const md5 = (value: string) => createHash("md5").update(value).digest("hex");

describe("transcriptLines", () => {
  it("reads Cognigy-style turns and labels the speakers", () => {
    expect(
      transcriptLines([
        { role: "assistant", payload: { text: "Hi Jane, how can I help?" } },
        { role: "user", text: " My card was declined. " },
        { source: "bot", data: { text: "I can connect you with an agent." } },
        { role: "user", payload: { data: { buttons: [] } } },
      ]),
    ).toEqual([
      { speaker: "AI agent", text: "Hi Jane, how can I help?" },
      { speaker: "Customer", text: "My card was declined." },
      { speaker: "AI agent", text: "I can connect you with an agent." },
    ]);
  });

  it("accepts a wrapped array or plain text", () => {
    expect(transcriptLines({ transcript: [{ type: "input", text: "hello" }] })).toEqual([
      { speaker: "Customer", text: "hello" },
    ]);
    expect(transcriptLines("  USER: hello  ")).toBe("USER: hello");
    expect(transcriptLines('[{"role":"user","text":"hi"}]')).toEqual([{ speaker: "Customer", text: "hi" }]);
  });
});

describe("transcriptNote", () => {
  it("builds the internal note with the reason", () => {
    const note = transcriptNote([{ role: "user", text: "I want a person" }], "Customer asked for an agent");
    expect(note).toBe(
      "Call transcript: AI agent and customer, before the handover\n\nCustomer: I want a person\n\nHandover reason: Customer asked for an agent",
    );
  });

  it("says when there was no transcript", () => {
    expect(transcriptNote(undefined)).toContain("(The AI agent sent no transcript.)");
  });
});

describe("digestMatches", () => {
  const base = { method: "REGISTER", username: "oneix-abc", realm: "sip.example.com", nonce: "n1", uri: "sip:sip.example.com" };
  const ha1 = md5("oneix-abc:sip.example.com:secret");
  const ha2 = md5("REGISTER:sip:sip.example.com");

  it("accepts the right password, with and without qop", () => {
    expect(digestMatches({ ...base, response: md5(`${ha1}:n1:${ha2}`) }, "secret")).toBe(true);
    const qop = { qop: "auth", nc: "00000001", cnonce: "c1" };
    expect(
      digestMatches({ ...base, ...qop, response: md5(`${ha1}:n1:00000001:c1:auth:${ha2}`) }, "secret"),
    ).toBe(true);
  });

  it("refuses a wrong password or another algorithm", () => {
    expect(digestMatches({ ...base, response: md5(`${ha1}:n1:${ha2}`) }, "wrong")).toBe(false);
    expect(digestMatches({ ...base, algorithm: "SHA-256", response: md5(`${ha1}:n1:${ha2}`) }, "secret")).toBe(false);
  });
});

describe("gatewaySignatureMatches", () => {
  const body = '{"method":"REGISTER"}';
  const now = 1_790_000_000_000;
  const t = now / 1000;
  const sign = (timestamp: number, secret = "whsec") =>
    `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

  it("accepts a fresh signature from the shared secret", () => {
    expect(gatewaySignatureMatches(sign(t), body, "whsec", now)).toBe(true);
  });

  it("refuses a missing, wrong, or old signature", () => {
    expect(gatewaySignatureMatches(undefined, body, "whsec", now)).toBe(false);
    expect(gatewaySignatureMatches(sign(t, "other"), body, "whsec", now)).toBe(false);
    expect(gatewaySignatureMatches(sign(t - 3600), body, "whsec", now)).toBe(false);
  });
});

describe("busyMessage", () => {
  it("reads the reference number digit by digit", () => {
    expect(busyMessage(9800)).toContain("Your reference number is 9 8 0 0.");
  });
});
