import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    SESSION_SECRET: z.string().min(32),
    AUTH_DEV_LOGIN: z.stringbool().default(false),

    /** Encrypts tenant credentials at rest. 32 bytes, base64. */
    ONEIX_ENCRYPTION_KEY: z.string().min(1),
  })
  .refine((c) => !(c.NODE_ENV === "production" && c.AUTH_DEV_LOGIN), {
    message: "AUTH_DEV_LOGIN must be off in production",
  });

export type AppConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Validates the environment once at startup and exits if anything is missing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Empty values in .env mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    console.error(`Invalid api configuration:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
