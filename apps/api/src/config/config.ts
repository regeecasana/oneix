import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    AUTH_DEV_LOGIN: z.stringbool().default(false),
    /** Serves the API reference at /docs and the OpenAPI document at /openapi.json. Defaults to on outside production. */
    API_DOCS: z.stringbool().optional(),

    /** Encrypts tenant credentials at rest. 32 bytes, base64. */
    ONEIX_ENCRYPTION_KEY: z.string().min(1),

    /** Websites allowed to start calls with POST /widget/calls, comma-separated. */
    WIDGET_ORIGINS: z
      .string()
      .default("http://localhost:3002")
      .transform((value) => value.split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean)),
    /** Bearer token the Cognigy Flow sends to /voice/flow. Voice calls are off without it. */
    VOICE_FLOW_SECRET: z.string().min(24).optional(),
    /**
     * Click To Call Endpoint URLs whose widget logins oneix accepts, comma-separated. With the
     * registration webhook pointing at oneix, Voice Gateway asks oneix about customers' widget calls
     * too. Defaults to the landing page's NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL.
     */
    VOICE_C2C_ENDPOINT_URLS: z
      .string()
      .optional()
      .transform((value) => (value ?? "").split(",").map((url) => url.trim()).filter(Boolean)),
    NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL: z.string().optional(),
    /** Voice Gateway's Webhook Secret, to check that registration requests come from it. */
    VOICE_GATEWAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    /** The SIP realm (domain) agents' softphones register in on Voice Gateway. */
    VOICE_SIP_REALM: z.string().min(1).optional(),
    /** Voice Gateway's secure WebSocket for softphones, for example wss://<gateway>:8443. */
    VOICE_GATEWAY_WSS_URL: z.url().optional(),
    /** How long agents' softphones ring on a handover before the AI tells the caller nobody is free. */
    VOICE_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(120).default(30),
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
  const config = result.data;
  if (config.VOICE_C2C_ENDPOINT_URLS.length === 0 && config.NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL) {
    config.VOICE_C2C_ENDPOINT_URLS = [config.NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL];
  }
  return config;
}
