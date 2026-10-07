import { Controller, Get, Inject } from "@nestjs/common";
import type { ListAgentsResponse } from "@oneix/contracts";
import { type PrismaClient, scopedToTenant } from "@oneix/db";
import { CurrentUser, type SessionUser } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";

@Controller("users")
export class UsersController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Active agents in the signed-in agent's tenant, for the assignee picker. */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<ListAgentsResponse> {
    const memberships = await scopedToTenant(this.prisma, user.tenantId).tenantMembership.findMany({
      where: { active: true },
      select: { role: true, roleNames: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return { items: memberships.map((m) => ({ ...m.user, role: m.role, roles: m.roleNames })) };
  }
}
