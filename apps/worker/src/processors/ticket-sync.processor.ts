import {
  TICKET_SYNC_JOBS,
  type TicketBackfillJob,
  type TicketSyncOneJob,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type CacheResult, type PrismaClient } from "@oneix/db";
import type { Logger } from "@oneix/logger";
import type { TicketingProvider } from "@oneix/ticketing";
import type { Job } from "bullmq";

/** Pages per run. Incremental exports are rate limited, so a large backlog spreads over several runs. */
const BACKFILL_MAX_PAGES = 5;

/** Where the backfill remembers how far it got, per tenant. */
export interface CursorStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export interface SyncDeps {
  prisma: PrismaClient;
  ticketing: TicketingProvider;
  logger: Logger;
  cursors: CursorStore;
}

/** Refreshes one cached ticket from the backend. */
export async function syncTicket(deps: SyncDeps, tenantId: string, externalId: string): Promise<CacheResult> {
  const ticket = await deps.ticketing.getTicket(externalId);
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
  const key = `oneix:ticket-backfill:${tenantId}:cursor`;
  let cursor = (await deps.cursors.get(key)) ?? undefined;
  let synced = 0;

  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const result = await deps.ticketing.listTickets(cursor ? { cursor } : { updatedSince: new Date(0) });
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

export function ticketSyncProcessor(deps: SyncDeps) {
  return async (job: Job<TicketSyncOneJob | TicketBackfillJob>) => {
    switch (job.name) {
      case TICKET_SYNC_JOBS.one: {
        const data = job.data as TicketSyncOneJob;
        return syncTicket(deps, data.tenantId, data.externalId);
      }
      case TICKET_SYNC_JOBS.backfill:
        return backfillTickets(deps, job.data.tenantId);
      default:
        throw new Error(`Unknown ticket-sync job: ${job.name}`);
    }
  };
}
