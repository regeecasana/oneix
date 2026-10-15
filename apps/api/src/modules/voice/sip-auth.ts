import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Voice Gateway asks oneix whether a softphone may register, the way jambonz (which Voice Gateway
 * runs on) calls a registration webhook: it forwards the SIP digest challenge response, and oneix
 * checks it against the password it gave the agent.
 */
export interface DigestChallengeResponse {
  method?: string;
  username: string;
  realm: string;
  nonce: string;
  uri: string;
  response: string;
  algorithm?: string;
  qop?: string;
  nc?: string;
  cnonce?: string;
}

/** Checks an MD5 SIP digest (RFC 2617), with or without qop. */
export function digestMatches(challenge: DigestChallengeResponse, password: string): boolean {
  if (challenge.algorithm && challenge.algorithm.toUpperCase() !== "MD5") return false;
  const ha1 = md5(`${challenge.username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${challenge.method ?? "REGISTER"}:${challenge.uri}`);
  const expected = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${challenge.nc ?? ""}:${challenge.cnonce ?? ""}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  return safeEqual(expected, challenge.response.toLowerCase());
}

/** How old a signed request may be, against replays. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Checks a webhook signature from Voice Gateway's Webhook Secret, in jambonz's format, sent in the
 * `VG-Signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.
 */
export function gatewaySignatureMatches(
  header: string | undefined,
  rawBody: Buffer | string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!header) return false;
  const fields = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key ?? "", rest.join("=")] as const;
    }),
  );
  const timestamp = Number(fields.get("t"));
  const signature = fields.get("v1");
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString()}`).digest("hex");
  return safeEqual(expected, signature);
}

/**
 * What a refused signature looked like, for the log: which headers came, the signature's shape, the
 * clock difference, and which way of signing would have matched. No secrets or credentials.
 */
export function describeGatewaySignature(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer | string | undefined,
  parsedBody: unknown,
  secret: string,
  now = Date.now(),
): Record<string, unknown> {
  const signatureHeaders = Object.keys(headers).filter((name) => /sign|hmac|jambonz/i.test(name));
  const value = String(headers["vg-signature"] ?? headers["jambonz-signature"] ?? headers[signatureHeaders[0] ?? ""] ?? "");
  const fields = new Map(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key ?? "", rest.join("=")] as const;
    }),
  );
  const timestamp = fields.get("t") ?? "";
  const signature = fields.get("v1") ?? value;
  const raw = rawBody === undefined ? undefined : rawBody.toString();
  const json = JSON.stringify(parsedBody ?? {});
  const hmac = (key: string, payload: string) => createHmac("sha256", key).update(payload).digest("hex");
  const candidates: Record<string, string | undefined> = {
    "t.rawBody": raw === undefined ? undefined : hmac(secret, `${timestamp}.${raw}`),
    "t.jsonBody": hmac(secret, `${timestamp}.${json}`),
    rawBody: raw === undefined ? undefined : hmac(secret, raw),
    jsonBody: hmac(secret, json),
  };
  return {
    headerNames: Object.keys(headers),
    signatureHeaders,
    signatureFields: [...fields.keys()],
    signatureLength: signature.length,
    clockDifferenceSeconds: timestamp ? Math.round(now / 1000 - Number(timestamp)) : null,
    contentType: headers["content-type"],
    rawBodyLength: raw?.length ?? null,
    matches: Object.entries(candidates)
      .filter(([, expected]) => expected !== undefined && expected === signature.toLowerCase())
      .map(([name]) => name),
  };
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
