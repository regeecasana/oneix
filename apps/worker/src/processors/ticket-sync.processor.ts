import {
  type AgentSyncJob,
  type FanOutJob,
  TICKET_SYNC_JOBS,
  type TicketBackfillJob,
  type TicketSyncOneJob,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type CacheResult, type PrismaClient } from "@oneix/db";
import type { Logger } from "@oneix/logger";
import { type AgentSyncResult, syncAgents, type TicketingRegistry } from "@oneix/tenancy";
import { TicketingError } from "@oneix/ticketing";
import type { Job, Queue } from "bullmq";

/** Pages per run. Incremental exports are rate limited, so a large backlog spreads over several runs. */
const BACKFILL_MAX_PAGES = 5;

/** Where the backfill remembers how far it got, per tenant. */
export interface CursorStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export interface SyncDeps {
  prisma: PrismaClient;
  registry: TicketingRegistry;
  logger: Logger;
  cursors: CursorStore;
  /** The ticket-sync queue, for fan-out. */
  queue: Queue;
}

/** Refreshes one cached ticket from the tenant's backend. */
export async function syncTicket(deps: SyncDeps, tenantId: string, externalId: string): Promise<CacheResult> {
  const ticketing = await deps.registry.for(tenantId);
  const ticket = await ticketing.getTicket(externalId);
  if (!ticket) {
    await deps.prisma.ticket.deleteMany({ where: { tenantId, externalId } });
    return { outcome: "deleted" };
  }
  return cacheTicketSnapshot(deps.prisma, tenantId, ticket);
}

/**
 * Pulls every ticket changed since the last run, resuming from a stored cursor.
 * The first run imports everything. Safety net for missed webhooks.
 */
export async function backfillTickets(deps: SyncDeps, tenantId: string): Promise<{ synced: number }> {
  const ticketing = await deps.registry.for(tenantId);
  const key = `oneix:ticket-backfill:${tenantId}:cursor`;
  let cursor = (await deps.cursors.get(key)) ?? undefined;
  let synced = 0;

  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const result = await ticketing.listTickets(cursor ? { cursor } : { updatedSince: new Date(0) });
    for (const ticket of result.tickets) {
      await cacheTicketSnapshot(deps.prisma, tenantId, ticket);
      synced++;
    }
    // Saved after each page so a failed run resumes where it stopped.
    if (result.nextCursor) await deps.cursors.set(key, result.nextCursor);
    if (result.endOfStream || !result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }

  deps.logger.info({ tenantId, synced, cursor }, "ticket backfill finished");
  return { synced };
}

export async function provisionAgents(deps: SyncDeps, tenantId: string): Promise<AgentSyncResult> {
  const result = await syncAgents(deps.prisma, tenantId, await deps.registry.for(tenantId));
  deps.logger.info({ tenantId, ...result }, "agent sync finished");
  return result;
}

/** Queues a backfill or agent sync for every tenant with a usable connection. */
export async function fanOut(deps: SyncDeps, job: FanOutJob["job"]): Promise<{ tenants: number }> {
  const connections = await deps.prisma.tenantConnection.findMany({
    where: { provider: "zendesk", status: { not: "disabled" } },
    select: { tenantId: true },
  });
  for (const { tenantId } of connections) {
    // One pending job per tenant and kind: a slow tenant never piles up duplicates.
    await deps.queue.add(job, { tenantId }, {
      jobId: `${job}.${tenantId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
  return { tenants: connections.length };
}

/**
 * Runs a tenant's job and records whether its backend is reachable, so operations can see failing
 * tenants. Rejected credentials mark the connection failing; any success marks it active again.
 */
async function withStatus<T>(deps: SyncDeps, tenantId: string, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    await deps.registry.reportStatus(tenantId, "active");
    return result;
  } catch (error) {
    if (error instanceof TicketingError && (error.status === 401 || error.status === 403)) {
      await deps.registry.reportStatus(tenantId, "failing", error.message);
    }
    throw error;
  }
}

export function ticketSyncProcessor(deps: SyncDeps) {
  return async (job: Job) => {
    switch (job.name) {
      case TICKET_SYNC_JOBS.one: {
        const data = job.data as TicketSyncOneJob;
        return syncTicket(deps, data.tenantId, data.externalId);
      }
      case TICKET_SYNC_JOBS.backfill: {
        const { tenantId } = job.data as TicketBackfillJob;
        return withStatus(deps, tenantId, () => backfillTickets(deps, tenantId));
      }
      case TICKET_SYNC_JOBS.agents: {
        const { tenantId } = job.data as AgentSyncJob;
        return withStatus(deps, tenantId, () => provisionAgents(deps, tenantId));
      }
      case TICKET_SYNC_JOBS.fanOut:
        return fanOut(deps, (job.data as FanOutJob).job);
      default:
        throw new Error(`Unknown ticket-sync job: ${job.name}`);
    }
  };
}
