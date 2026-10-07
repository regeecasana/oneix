import { type FanOutJob, TICKET_SYNC_JOBS } from "@oneix/contracts";
import type { Queue } from "bullmq";

/**
 * Registers the repeating jobs that keep every tenant in sync. Each run fans out one job per
 * connected tenant, so tenants added later are picked up without a restart.
 */
export async function scheduleTenantSync(
  queue: Queue,
  intervals: { backfillMinutes: number; agentsMinutes: number },
): Promise<void> {
  // Replaces the single-tenant scheduler from before tenant connections existed.
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key.startsWith("ticket-backfill:")) await queue.removeJobScheduler(scheduler.key);
  }

  const schedules: [FanOutJob["job"], number][] = [
    [TICKET_SYNC_JOBS.backfill, intervals.backfillMinutes],
    [TICKET_SYNC_JOBS.agents, intervals.agentsMinutes],
  ];
  for (const [job, minutes] of schedules) {
    const data: FanOutJob = { job };
    await queue.upsertJobScheduler(
      `fan-out:${job}`,
      { every: minutes * 60 * 1000 },
      { name: TICKET_SYNC_JOBS.fanOut, data },
    );
  }
}
