import { Controller, Get, Inject } from "@nestjs/common";
import type { PrismaClient } from "@oneix/db";
import { Public } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async check(): Promise<{ status: "ok" }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
