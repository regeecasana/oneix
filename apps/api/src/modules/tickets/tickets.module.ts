import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { TicketFormsController } from "./ticket-forms.controller.js";
import { TicketFormsService } from "./ticket-forms.service.js";
import { TicketsController } from "./tickets.controller.js";
import { TicketsService } from "./tickets.service.js";

@Module({
  imports: [AuditModule],
  controllers: [TicketsController, TicketFormsController],
  providers: [TicketsService, TicketFormsService],
})
export class TicketsModule {}
