import { TICKET_SYNC_JOBS, type TicketBackfillJob } from "@oneix/contracts";
import type { Queue } from "bullmq";

/** Registers (or updates) the repeating ticket cache backfill. */
export async function scheduleTicketBackfill(queue: Queue, tenantId: string, intervalMinutes: number): Promise<void> {
  const data: TicketBackfillJob = { tenantId };
  await queue.upsertJobScheduler(
    `ticket-backfill:${tenantId}`,
    { every: intervalMinutes * 60 * 1000 },
    { name: TICKET_SYNC_JOBS.backfill, data, opts: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } } },
  );
}
