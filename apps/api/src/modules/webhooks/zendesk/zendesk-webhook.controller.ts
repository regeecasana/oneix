import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { Public } from "../../../common/auth.js";
import { APP_CONFIG, type AppConfig } from "../../../config/config.js";
import { WebhookIntakeService } from "../webhook-intake.service.js";
import { verifyZendeskSignature } from "./signature.js";

/** Body defined by the webhook's trigger. See platform/zendesk. */
const TicketUpdatedPayload = z.object({
  ticket_id: z.coerce.string().regex(/^\d+$/),
  updated_at: z.string().min(1),
});

@Public()
@Controller("webhooks/zendesk")
export class ZendeskWebhookController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly intake: WebhookIntakeService,
  ) {}

  @Post("ticket-updated")
  @HttpCode(200)
  async ticketUpdated(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-zendesk-webhook-signature") signature: string | undefined,
    @Headers("x-zendesk-webhook-signature-timestamp") timestamp: string | undefined,
  ): Promise<{ received: true }> {
    const secret = this.config.ZENDESK_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException("Webhook secret not configured");
    if (!verifyZendeskSignature(request.rawBody, signature, timestamp, secret)) {
      throw new UnauthorizedException();
    }

    const parsed = TicketUpdatedPayload.safeParse(request.body);
    if (!parsed.success) throw new BadRequestException("Unexpected payload");

    await this.intake.receive({
      source: "zendesk",
      eventKey: `ticket-updated:${parsed.data.ticket_id}:${parsed.data.updated_at}`,
      payload: parsed.data,
    });
    return { received: true };
  }
}
