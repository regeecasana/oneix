import { Controller, Get, Inject } from "@nestjs/common";
import type { ListAgentsResponse } from "@oneix/contracts";
import type { PrismaClient } from "@oneix/db";
import { CurrentUser, type SessionUser } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";

@Controller("users")
export class UsersController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Agents in the tenant, for the assignee picker. */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<ListAgentsResponse> {
    const items = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    return { items };
  }
}
