import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import type { PrismaClient } from "@oneix/db";
import { Public } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";

@ApiTags("Health")
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  @ApiOperation({ summary: "Health check", description: "Answers when the API is up and can reach its database." })
  @ApiOkResponse({
    schema: { type: "object", properties: { status: { type: "string", enum: ["ok"] } }, required: ["status"] },
  })
  @ApiServiceUnavailableResponse({ description: "The database can't be reached." })
  async check(): Promise<{ status: "ok" }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
