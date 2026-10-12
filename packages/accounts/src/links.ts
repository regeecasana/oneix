import type { BackendAgent, Prisma, PrismaClient } from "@oneix/db";
import { AccountError } from "./errors.js";

/** The permissions a membership takes from its linked backend user. */
export function permissionsFrom(agent: BackendAgent) {
  return {
    roleNames: agent.roleNames,
    canReplyPublicly: agent.canReplyPublicly,
    ticketAccess: agent.ticketAccess,
    groupExternalIds: agent.groupExternalIds,
    organizationExternalIds: agent.organizationExternalIds,
  } satisfies Prisma.TenantMembershipUpdateInput;
}

/** What an unlinked membership has: nothing from the backend, and no public replies. */
const UNLINKED = {
  zendeskUserId: null,
  zendeskLinkedAt: null,
  roleNames: [],
  canReplyPublicly: false,
  ticketAccess: "assigned",
  groupExternalIds: [],
  organizationExternalIds: [],
} satisfies Prisma.TenantMembershipUpdateInput;

/**
 * Links a oneix account's membership to a user in the tenant's Zendesk, copying that user's
 * permissions, or unlinks it with `externalId` null. A Zendesk user can be linked to one account.
 */
export async function linkBackendAgent(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  externalId: string | null,
): Promise<void> {
  if (externalId === null) {
    await prisma.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: UNLINKED,
    });
    return;
  }

  const agent = await prisma.backendAgent.findUnique({
    where: { tenantId_provider_externalId: { tenantId, provider: "zendesk", externalId } },
  });
  if (!agent) throw new AccountError("agent_not_found", "That Zendesk user isn't in this workspace's directory.");

  const linkedElsewhere = await prisma.tenantMembership.findUnique({
    where: { tenantId_zendeskUserId: { tenantId, zendeskUserId: externalId } },
    select: { userId: true },
  });
  if (linkedElsewhere && linkedElsewhere.userId !== userId) {
    throw new AccountError("agent_already_linked", "That Zendesk user is already linked to another account.");
  }

  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId, userId } },
    data: { zendeskUserId: externalId, zendeskLinkedAt: new Date(), ...permissionsFrom(agent) },
  });
}

/** The directory entry with the account's email that no one has linked yet, if there is one. */
export async function suggestedBackendAgent(
  prisma: PrismaClient,
  tenantId: string,
  email: string,
): Promise<BackendAgent | null> {
  const agent = await prisma.backendAgent.findFirst({
    where: { tenantId, provider: "zendesk", email: { equals: email, mode: "insensitive" }, active: true },
  });
  if (!agent) return null;
  const taken = await prisma.tenantMembership.findUnique({
    where: { tenantId_zendeskUserId: { tenantId, zendeskUserId: agent.externalId } },
    select: { id: true },
  });
  return taken ? null : agent;
}
