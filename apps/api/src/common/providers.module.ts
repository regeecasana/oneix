import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { QUEUES, redisConnectionFromUrl } from "@oneix/contracts";
import { createPrismaClient, type PrismaClient } from "@oneix/db";
import { SecretBox, TicketingRegistry } from "@oneix/tenancy";
import { Queue } from "bullmq";
import { APP_CONFIG, type AppConfig, loadConfig } from "../config/config.js";

export const PRISMA = Symbol("PRISMA");
/** TicketingRegistry: the ticketing client for any tenant. */
export const TICKETING = Symbol("TICKETING");
export const WEBHOOK_QUEUE = Symbol("WEBHOOK_QUEUE");

/** Config, database, per-tenant ticketing clients, and queues, available to every module. */
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
      inject: [APP_CONFIG, PRISMA],
      useFactory: (config: AppConfig, prisma: PrismaClient) =>
        new TicketingRegistry(prisma, new SecretBox(config.ONEIX_ENCRYPTION_KEY)),
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
