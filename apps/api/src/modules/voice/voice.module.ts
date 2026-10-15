import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { FlowSecretGuard } from "./flow-secret.guard.js";
import { PresenceService } from "./presence.service.js";
import { VoiceCallsService } from "./voice-calls.service.js";
import { FlowController, SipRegistrationController, VoiceController, WidgetController } from "./voice.controllers.js";
import { VoiceEventsService } from "./voice-events.service.js";

/** Website calls answered by the Cognigy AI agent and handed over to agents in the workspace. */
@Module({
  imports: [AuditModule],
  controllers: [WidgetController, FlowController, SipRegistrationController, VoiceController],
  providers: [VoiceCallsService, PresenceService, VoiceEventsService, FlowSecretGuard],
})
export class VoiceModule {}
