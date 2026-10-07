import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./common/auth.js";
import { ProvidersModule } from "./common/providers.module.js";
import { TicketingErrorFilter } from "./common/ticketing-error.filter.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { HealthController } from "./modules/health/health.controller.js";
import { TicketsModule } from "./modules/tickets/tickets.module.js";
import { UsersController } from "./modules/users/users.controller.js";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.js";

@Module({
  imports: [ProvidersModule, AuditModule, TicketsModule, WebhooksModule],
  controllers: [AuthController, UsersController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: TicketingErrorFilter },
  ],
})
export class AppModule {}
