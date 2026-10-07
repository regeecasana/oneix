import { QUEUES, redisConnectionFromUrl } from "@oneix/contracts";
import { createPrismaClient } from "@oneix/db";
import { createLogger } from "@oneix/logger";
import { ZendeskProvider } from "@oneix/ticketing";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { ticketSyncProcessor } from "./processors/ticket-sync.processor.js";
import { webhookProcessor } from "./processors/webhook.processor.js";
import { scheduleTicketBackfill } from "./schedulers/ticket-backfill.js";

const config = loadConfig();
const logger = createLogger("worker");
const connection = redisConnectionFromUrl(config.REDIS_URL);

const ticketSyncQueue = new Queue(QUEUES.ticketSync, { connection });
/** Plain Redis client for worker state, such as the backfill cursor. */
const redis = new Redis(connection);

const deps = {
  cursors: {
    get: (key: string) => redis.get(key),
    set: (key: string, value: string) => redis.set(key, value),
  },
  prisma: createPrismaClient(config.DATABASE_URL),
  ticketing: new ZendeskProvider({
    subdomain: config.ZENDESK_SUBDOMAIN,
    clientId: config.ZENDESK_CLIENT_ID,
    clientSecret: config.ZENDESK_CLIENT_SECRET,
    accessToken: config.ZENDESK_ACCESS_TOKEN,
    apiToken:
      config.ZENDESK_EMAIL && config.ZENDESK_API_TOKEN
        ? { email: config.ZENDESK_EMAIL, token: config.ZENDESK_API_TOKEN }
        : undefined,
    impersonate: config.ZENDESK_IMPERSONATE,
  }),
  logger,
};

// Low concurrency keeps backend calls well under its rate limits.
const workers = [
  new Worker(QUEUES.webhooks, webhookProcessor(deps), { connection, concurrency: 5 }),
  new Worker(QUEUES.ticketSync, ticketSyncProcessor(deps), { connection, concurrency: 1 }),
];
for (const worker of workers) {
  worker.on("failed", (job, err) =>
    logger.warn({ queue: worker.name, jobId: job?.id, attempt: job?.attemptsMade, err }, "job failed"),
  );
  worker.on("error", (err) => logger.error({ queue: worker.name, err }, "worker error"));
}

await scheduleTicketBackfill(ticketSyncQueue, config.TENANT_ID, config.TICKET_BACKFILL_INTERVAL_MINUTES);

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled([...workers.map((w) => w.close()), ticketSyncQueue.close()]);
  redis.disconnect();
  await deps.prisma.$disconnect();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
