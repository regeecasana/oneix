import { permissionsFrom } from "@oneix/accounts";
import type { BackendAgent, PrismaClient } from "@oneix/db";
import type { ExternalAgent, TicketingProvider } from "@oneix/ticketing";

export interface AgentSyncResult {
  /** Agents and admins in the tenant's backend directory after the sync. */
  directory: number;
  /** oneix accounts linked to a backend user, whose permissions were refreshed. */
  linked: number;
  /** Linked accounts that lost access because their backend user was removed or suspended. */
  deactivated: number;
}

/**
 * Refreshes the tenant's directory of backend users (Zendesk agents and admins) and the
 * permissions of the oneix accounts linked to them.
 *
 * The directory never grants access: oneix accounts are invited, then linked to a directory
 * entry. A linked account whose backend user is removed or suspended loses access to the
 * workspace; an admin turns it back on.
 */
export async function syncAgents(
  prisma: PrismaClient,
  tenantId: string,
  ticketing: TicketingProvider,
): Promise<AgentSyncResult> {
  const agents = (await ticketing.listAgents()).filter((agent) => agent.role !== "end_user");
  const syncedAt = new Date();
  const result: AgentSyncResult = { directory: 0, linked: 0, deactivated: 0 };

  for (const agent of agents) {
    const row = await upsertBackendAgent(prisma, tenantId, agent, syncedAt);
    result.directory++;

    if (!agent.active) continue;
    const updated = await prisma.tenantMembership.updateMany({
      where: { tenantId, zendeskUserId: agent.externalId },
      data: permissionsFrom(row),
    });
    result.linked += updated.count;
  }

  // Users no longer returned by the backend have been deleted there.
  const returned = agents.map((agent) => agent.externalId);
  await prisma.backendAgent.updateMany({
    where: { tenantId, provider: "zendesk", externalId: { notIn: returned }, active: true },
    data: { active: false, syncedAt },
  });

  const inactive = await prisma.backendAgent.findMany({
    where: { tenantId, provider: "zendesk", active: false },
    select: { externalId: true },
  });
  const removed = await prisma.tenantMembership.updateMany({
    where: { tenantId, active: true, zendeskUserId: { in: inactive.map((agent) => agent.externalId) } },
    data: { active: false },
  });
  result.deactivated = removed.count;
  return result;
}

/** Writes one backend user into the tenant's directory, as the sync sees it. */
export function upsertBackendAgent(
  prisma: PrismaClient,
  tenantId: string,
  agent: ExternalAgent,
  syncedAt = new Date(),
): Promise<BackendAgent> {
  const data = {
    name: agent.name,
    email: agent.email?.toLowerCase() ?? null,
    role: agent.role === "admin" ? ("admin" as const) : ("agent" as const),
    roleNames: agent.roleNames,
    canReplyPublicly: agent.permissions.publicReplies,
    ticketAccess: agent.permissions.ticketAccess,
    groupExternalIds: agent.groupExternalIds,
    organizationExternalIds: agent.organizationExternalIds,
    active: agent.active,
    syncedAt,
  };
  return prisma.backendAgent.upsert({
    where: { tenantId_provider_externalId: { tenantId, provider: "zendesk", externalId: agent.externalId } },
    create: { tenantId, provider: "zendesk", externalId: agent.externalId, ...data },
    update: data,
  });
}
