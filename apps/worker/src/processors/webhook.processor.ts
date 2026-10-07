import type { WebhookJob } from "@oneix/contracts";
import type { Job } from "bullmq";
import { z } from "zod";
import { type SyncDeps, syncTicket } from "./ticket-sync.processor.js";

const ZendeskTicketUpdated = z.object({ ticket_id: z.string() });

/**
 * Processes a stored webhook event. Already-processed events are skipped, so redelivery is safe.
 * Errors are recorded on the event and rethrown so BullMQ retries with backoff.
 */
export function webhookProcessor(deps: SyncDeps) {
  return async (job: Job<WebhookJob>) => {
    const event = await deps.prisma.webhookEvent.findUnique({ where: { id: job.data.webhookEventId } });
    if (!event) throw new Error(`Webhook event ${job.data.webhookEventId} not found`);
    if (event.status === "processed") return { skipped: true };

    try {
      switch (event.source) {
        case "zendesk": {
          const payload = ZendeskTicketUpdated.parse(event.payload);
          await syncTicket(deps, event.tenantId, payload.ticket_id);
          break;
        }
        default:
          throw new Error(`No handler for webhook source ${event.source}`);
      }

      await deps.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "processed", processedAt: new Date(), attempts: { increment: 1 }, error: null },
      });
      return { processed: true };
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await deps.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          error: String(error).slice(0, 2000),
          status: finalAttempt ? "failed" : "pending",
        },
      });
      if (finalAttempt) deps.logger.error({ err: error, eventId: event.id }, "webhook event failed permanently");
      throw error;
    }
  };
}
