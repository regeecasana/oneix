import { QUEUES, redisConnectionFromUrl } from "@oneix/contracts";
import { createPrismaClient } from "@oneix/db";
import { createLogger } from "@oneix/logger";
import { SecretBox, TicketingRegistry } from "@oneix/tenancy";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { type SyncDeps, ticketSyncProcessor } from "./processors/ticket-sync.processor.js";
import { webhookProcessor } from "./processors/webhook.processor.js";
import { scheduleTenantSync } from "./schedulers/ticket-backfill.js";

const config = loadConfig();
const logger = createLogger("worker");
const connection = redisConnectionFromUrl(config.REDIS_URL);

const ticketSyncQueue = new Queue(QUEUES.ticketSync, { connection });
/** Plain Redis client for worker state, such as the backfill cursors. */
const redis = new Redis(connection);
const prisma = createPrismaClient(config.DATABASE_URL);

const deps: SyncDeps = {
  prisma,
  registry: new TicketingRegistry(prisma, new SecretBox(config.ONEIX_ENCRYPTION_KEY)),
  logger,
  cursors: {
    get: (key: string) => redis.get(key),
    set: (key: string, value: string) => redis.set(key, value),
  },
  queue: ticketSyncQueue,
};

// Each tenant has its own backend rate limit; low concurrency keeps every tenant well under it.
const workers = [
  new Worker(QUEUES.webhooks, webhookProcessor(deps), { connection, concurrency: 5 }),
  new Worker(QUEUES.ticketSync, ticketSyncProcessor(deps), { connection, concurrency: 2 }),
];
for (const worker of workers) {
  worker.on("failed", (job, err) =>
    logger.warn(
      { queue: worker.name, job: job?.name, tenantId: job?.data?.tenantId, attempt: job?.attemptsMade, err },
      "job failed",
    ),
  );
  worker.on("error", (err) => logger.error({ queue: worker.name, err }, "worker error"));
}

await scheduleTenantSync(ticketSyncQueue, {
  backfillMinutes: config.TICKET_BACKFILL_INTERVAL_MINUTES,
  agentsMinutes: config.AGENT_SYNC_INTERVAL_MINUTES,
});

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled([...workers.map((w) => w.close()), ticketSyncQueue.close()]);
  redis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
