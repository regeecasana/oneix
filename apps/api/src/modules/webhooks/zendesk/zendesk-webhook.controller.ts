import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@oneix/db";
import type { TicketingRegistry } from "@oneix/tenancy";
import type { Request } from "express";
import { z } from "zod";
import { Public } from "../../../common/auth.js";
import { PRISMA, TICKETING } from "../../../common/providers.module.js";
import { WebhookIntakeService } from "../webhook-intake.service.js";
import { verifyZendeskSignature } from "./signature.js";

/** Body defined by the webhook's trigger. See the README, Connecting Zendesk. */
const TicketUpdatedPayload = z.object({
  ticket_id: z.coerce.string().regex(/^\d+$/),
  updated_at: z.string().min(1),
});

/** Each tenant's Zendesk calls its own URL, signed with that tenant's secret. */
@Public()
@Controller("webhooks/zendesk/:tenant")
export class ZendeskWebhookController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly registry: TicketingRegistry,
    private readonly intake: WebhookIntakeService,
  ) {}

  @Post("ticket-updated")
  @HttpCode(200)
  async ticketUpdated(
    @Param("tenant") tenantSlug: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-zendesk-webhook-signature") signature: string | undefined,
    @Headers("x-zendesk-webhook-signature-timestamp") timestamp: string | undefined,
  ): Promise<{ received: true }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) throw new NotFoundException();

    const secret = await this.registry.webhookSecret(tenant.id);
    if (!secret) throw new ServiceUnavailableException("Webhook secret not configured");
    if (!verifyZendeskSignature(request.rawBody, signature, timestamp, secret)) {
      throw new UnauthorizedException();
    }

    const parsed = TicketUpdatedPayload.safeParse(request.body);
    if (!parsed.success) throw new BadRequestException("Unexpected payload");

    await this.intake.receive({
      tenantId: tenant.id,
      source: "zendesk",
      eventKey: `ticket-updated:${parsed.data.ticket_id}:${parsed.data.updated_at}`,
      payload: parsed.data,
    });
    return { received: true };
  }
}
