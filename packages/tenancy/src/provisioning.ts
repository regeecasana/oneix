import type { PrismaClient, UserRole } from "@oneix/db";
import type { ExternalAgent, TicketingProvider } from "@oneix/ticketing";

export interface AgentSyncResult {
  /** Agents with an active membership after the sync. */
  active: number;
  /** Memberships deactivated because the agent was removed or suspended in the backend. */
  deactivated: number;
  /** Backend agents skipped because they have no email to sign in with. */
  skipped: number;
}

/**
 * Makes the tenant's oneix agents match its backend agents.
 *
 * Each backend agent or admin becomes a oneix user (matched by email) with a membership in the tenant,
 * linked by backend user ID. Agents removed or suspended in the backend lose access to the tenant.
 * Memberships not linked to the backend are left alone.
 */
export async function syncAgents(
  prisma: PrismaClient,
  tenantId: string,
  ticketing: TicketingProvider,
): Promise<AgentSyncResult> {
  const agents = await ticketing.listAgents();
  const result: AgentSyncResult = { active: 0, deactivated: 0, skipped: 0 };
  const activeIds = new Set<string>();

  for (const agent of agents) {
    if (!agent.email || agent.role === "end_user") {
      result.skipped++;
      continue;
    }
    if (!agent.active) continue;

    await upsertMembership(prisma, tenantId, agent as ExternalAgent & { email: string });
    activeIds.add(agent.externalId);
    result.active++;
  }

  const stale = await prisma.tenantMembership.updateMany({
    where: { tenantId, active: true, zendeskUserId: { not: null, notIn: [...activeIds] } },
    data: { active: false },
  });
  result.deactivated = stale.count;
  return result;
}

async function upsertMembership(
  prisma: PrismaClient,
  tenantId: string,
  agent: ExternalAgent & { email: string },
): Promise<void> {
  const email = agent.email.toLowerCase();
  const role: UserRole = agent.role === "admin" ? "admin" : "agent";

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: agent.name },
    update: { name: agent.name },
    select: { id: true },
  });

  // The backend ID is the stable link. If it is already linked to another user
  // (the agent's email changed in the backend), that membership moves to this user.
  const linked = await prisma.tenantMembership.findUnique({
    where: { tenantId_zendeskUserId: { tenantId, zendeskUserId: agent.externalId } },
    select: { id: true, userId: true },
  });
  if (linked && linked.userId !== user.id) {
    await prisma.tenantMembership.update({ where: { id: linked.id }, data: { zendeskUserId: null, active: false } });
  }

  const permissions = {
    roleNames: agent.roleNames,
    canReplyPublicly: agent.permissions.publicReplies,
    ticketAccess: agent.permissions.ticketAccess,
  };
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: { tenantId, userId: user.id, role, zendeskUserId: agent.externalId, ...permissions },
    update: { role, zendeskUserId: agent.externalId, active: true, ...permissions },
  });
}
