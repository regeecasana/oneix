import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  /** Decrypts tenant credentials. 32 bytes, base64. */
  ONEIX_ENCRYPTION_KEY: z.string().min(1),
  TICKET_BACKFILL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  AGENT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(60),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    console.error(`Invalid worker configuration:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
