import { Inject, Injectable } from "@nestjs/common";
import type { WebhookJob } from "@oneix/contracts";
import { isUniqueViolation, type Prisma, type PrismaClient, type WebhookSource } from "@oneix/db";
import { createLogger } from "@oneix/logger";
import type { Queue } from "bullmq";
import { PRISMA, WEBHOOK_QUEUE } from "../../common/providers.module.js";

const logger = createLogger("api.webhooks");

export interface IncomingWebhook {
  tenantId: string;
  source: WebhookSource;
  eventKey: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Stores every webhook by its event key before processing, then hands it to the worker.
 * Duplicates are acknowledged and dropped.
 */
@Injectable()
export class WebhookIntakeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJob>,
  ) {}

  async receive(webhook: IncomingWebhook): Promise<{ duplicate: boolean }> {
    let eventId: string;
    try {
      const event = await this.prisma.webhookEvent.create({
        data: webhook,
        select: { id: true },
      });
      eventId = event.id;
    } catch (error) {
      if (isUniqueViolation(error)) return { duplicate: true };
      throw error;
    }

    await this.queue.add(
      webhook.source,
      { webhookEventId: eventId },
      { jobId: eventId, attempts: 5, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 1000 },
    );
    logger.debug({ eventId, source: webhook.source, eventKey: webhook.eventKey }, "webhook queued");
    return { duplicate: false };
  }
}
