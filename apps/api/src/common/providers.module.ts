import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { QUEUES, redisConnectionFromUrl } from "@oneix/contracts";
import { createPrismaClient, type PrismaClient } from "@oneix/db";
import { type TicketingProvider, ZendeskProvider } from "@oneix/ticketing";
import { Queue } from "bullmq";
import { APP_CONFIG, type AppConfig, loadConfig } from "../config/config.js";

export const PRISMA = Symbol("PRISMA");
export const TICKETING = Symbol("TICKETING");
export const WEBHOOK_QUEUE = Symbol("WEBHOOK_QUEUE");

/** Config, database, ticketing backend, and queues, available to every module. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: PRISMA,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createPrismaClient(config.DATABASE_URL),
    },
    {
      provide: TICKETING,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): TicketingProvider =>
        new ZendeskProvider({
          subdomain: config.ZENDESK_SUBDOMAIN,
          clientId: config.ZENDESK_CLIENT_ID,
          clientSecret: config.ZENDESK_CLIENT_SECRET,
          accessToken: config.ZENDESK_ACCESS_TOKEN,
          impersonate: config.ZENDESK_IMPERSONATE,
        }),
    },
    {
      provide: WEBHOOK_QUEUE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new Queue(QUEUES.webhooks, { connection: redisConnectionFromUrl(config.REDIS_URL) }),
    },
  ],
  exports: [APP_CONFIG, PRISMA, TICKETING, WEBHOOK_QUEUE],
})
export class ProvidersModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.webhookQueue.close(), this.prisma.$disconnect()]);
  }
}
