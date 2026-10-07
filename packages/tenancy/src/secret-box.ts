import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

/**
 * Encrypts tenant secrets at rest with AES-256-GCM.
 * Output: `v1.<iv>.<auth tag>.<ciphertext>`, each part base64url. The version prefix leaves room for key rotation.
 */
export class SecretBox {
  private readonly key: Buffer;

  /** @param keyBase64 32 random bytes, base64. Generate with `openssl rand -base64 32`. */
  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) {
      throw new Error("ONEIX_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
    }
  }

  static generateKey(): string {
    return randomBytes(32).toString("base64");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error("Unrecognized encrypted value");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(sealed: string): T {
    return JSON.parse(this.decrypt(sealed)) as T;
  }
}
