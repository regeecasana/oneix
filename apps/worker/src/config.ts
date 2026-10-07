import { z } from "zod";

const schema = z
  .object({
    TENANT_ID: z.string().min(1).default("default"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    TICKET_BACKFILL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),

    ZENDESK_SUBDOMAIN: z.string().min(1),
    ZENDESK_CLIENT_ID: z.string().optional(),
    ZENDESK_CLIENT_SECRET: z.string().optional(),
    ZENDESK_ACCESS_TOKEN: z.string().optional(),
    ZENDESK_EMAIL: z.string().optional(),
    ZENDESK_API_TOKEN: z.string().optional(),
    ZENDESK_IMPERSONATE: z.stringbool().default(false),
  })
  .refine(
    (c) =>
      c.ZENDESK_ACCESS_TOKEN ||
      (c.ZENDESK_EMAIL && c.ZENDESK_API_TOKEN) ||
      (c.ZENDESK_CLIENT_ID && c.ZENDESK_CLIENT_SECRET),
    {
      message:
        "Set ZENDESK_ACCESS_TOKEN, ZENDESK_EMAIL with ZENDESK_API_TOKEN, or ZENDESK_CLIENT_ID with ZENDESK_CLIENT_SECRET",
    },
  );

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
