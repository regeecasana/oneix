import { Module } from "@nestjs/common";
import { WebhookIntakeService } from "./webhook-intake.service.js";
import { ZendeskWebhookController } from "./zendesk/zendesk-webhook.controller.js";

@Module({
  controllers: [ZendeskWebhookController],
  providers: [WebhookIntakeService],
})
export class WebhooksModule {}
