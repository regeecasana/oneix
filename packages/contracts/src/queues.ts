/** Queue names and job payloads shared by api (producer) and worker (consumer). */
export const QUEUES = {
  webhooks: "webhooks",
  ticketSync: "ticket-sync",
} as const;

export interface WebhookJob {
  webhookEventId: string;
}

export const TICKET_SYNC_JOBS = {
  one: "sync-one",
  backfill: "backfill",
  agents: "sync-agents",
  /** Repeating job that enqueues `backfill` or `agents` for every connected tenant. */
  fanOut: "fan-out",
} as const;

export interface TicketSyncOneJob {
  tenantId: string;
  externalId: string;
}

export interface TicketBackfillJob {
  tenantId: string;
}

export interface AgentSyncJob {
  tenantId: string;
}

export interface FanOutJob {
  job: typeof TICKET_SYNC_JOBS.backfill | typeof TICKET_SYNC_JOBS.agents;
}

/** BullMQ connection options from a redis:// or rediss:// URL. */
export function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    // Required by BullMQ workers, harmless for producers.
    maxRetriesPerRequest: null,
  };
}
