import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AccountErrorFilter } from "./common/account-error.filter.js";
import { AuthGuard } from "./common/auth.js";
import { ProvidersModule } from "./common/providers.module.js";
import { SessionStore } from "./common/session.js";
import { TicketingErrorFilter } from "./common/ticketing-error.filter.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { HealthController } from "./modules/health/health.controller.js";
import { TeamController } from "./modules/team/team.controller.js";
import { TeamService } from "./modules/team/team.service.js";
import { TicketsModule } from "./modules/tickets/tickets.module.js";
import { UsersController } from "./modules/users/users.controller.js";
import { VoiceModule } from "./modules/voice/voice.module.js";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.js";

@Module({
  imports: [ProvidersModule, AuditModule, TicketsModule, VoiceModule, WebhooksModule],
  controllers: [AuthController, TeamController, UsersController, HealthController],
  providers: [
    SessionStore,
    AuthService,
    TeamService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: TicketingErrorFilter },
    { provide: APP_FILTER, useClass: AccountErrorFilter },
  ],
})
export class AppModule {}
