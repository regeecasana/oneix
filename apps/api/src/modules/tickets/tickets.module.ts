import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { TicketsController } from "./tickets.controller.js";
import { TicketsService } from "./tickets.service.js";

@Module({
  imports: [AuditModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
