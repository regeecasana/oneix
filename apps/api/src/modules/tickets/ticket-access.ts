import type { Prisma } from "@oneix/db";
import type { SessionUser } from "../../common/auth.js";

/**
 * The tickets an agent may see, mirroring the backend's ticket restriction:
 * - all: every ticket in the tenant
 * - groups: tickets in the agent's groups
 * - organization: tickets from the agent's organizations
 * - assigned / requested: only tickets assigned to or requested by the agent
 * Tickets assigned to the agent are always visible, as in the backend.
 */
export function ticketAccessWhere(user: SessionUser): Prisma.TicketWhereInput {
  const assignedToMe: Prisma.TicketWhereInput = { assigneeId: user.id };

  switch (user.ticketAccess) {
    case "all":
      return {};
    case "groups":
      return { OR: [{ groupExternalId: { in: user.groupExternalIds } }, assignedToMe] };
    case "organization":
      return { OR: [{ organizationExternalId: { in: user.organizationExternalIds } }, assignedToMe] };
    case "assigned":
      return assignedToMe;
    case "requested":
      return user.zendeskUserId
        ? { OR: [{ customer: { externalId: user.zendeskUserId } }, assignedToMe] }
        : assignedToMe;
  }
}
