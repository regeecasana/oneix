import type { TicketStatus } from "@oneix/contracts";
import type { ExternalAgent, ExternalComment, ExternalCustomer, ExternalTicket } from "../provider.js";
import type { ZendeskComment, ZendeskStatus, ZendeskTicket, ZendeskUser } from "./types.js";

export function fromZendeskStatus(status: ZendeskStatus): TicketStatus {
  switch (status) {
    case "hold":
      return "on_hold";
    case "deleted":
      return "closed";
    default:
      return status;
  }
}

export function toZendeskStatus(status: TicketStatus): Exclude<ZendeskStatus, "deleted"> {
  return status === "on_hold" ? "hold" : status;
}

export function toCustomer(user: ZendeskUser): ExternalCustomer {
  return {
    externalId: String(user.id),
    name: user.name || null,
    email: user.email || null,
    phone: user.phone || null,
  };
}

/** Zendesk role types limited to private comments: light agent, chat-only agent, contributor. */
const PRIVATE_COMMENT_ROLE_TYPES = new Set([1, 2, 3]);

/** Names for Zendesk's built-in role types, used when an agent has no custom role. */
const ROLE_TYPE_NAMES: Record<number, string> = {
  1: "Light agent",
  2: "Chat-only agent",
  3: "Contributor",
  4: "Admin",
  5: "Billing admin",
};

/** A Zendesk custom role, as far as oneix needs it. */
export interface CustomRole {
  name: string;
  publicComments: boolean;
}

/** Every role the user holds, primary role first: "Light agent", "Moderator". */
export function roleNamesOf(user: ZendeskUser, customRoles?: Map<number, CustomRole>): string[] {
  const customRole = user.custom_role_id != null ? customRoles?.get(user.custom_role_id) : undefined;
  const primary =
    user.role === "admin"
      ? "Admin"
      : (customRole?.name ?? ROLE_TYPE_NAMES[user.role_type ?? -1] ?? (user.role === "agent" ? "Agent" : "End user"));
  return user.moderator ? [primary, "Moderator"] : [primary];
}

/**
 * @param customRoles the account's custom roles by ID. When they could not be read, pass undefined
 *   and the role type decides.
 */
export function toAgent(user: ZendeskUser, customRoles?: Map<number, CustomRole>): ExternalAgent {
  let publicReplies = user.role === "admin" || !PRIVATE_COMMENT_ROLE_TYPES.has(user.role_type ?? -1);
  const customRole = user.custom_role_id != null ? customRoles?.get(user.custom_role_id) : undefined;
  if (user.role !== "admin" && customRole) publicReplies = customRole.publicComments;
  return {
    externalId: String(user.id),
    name: user.name,
    email: user.email || null,
    role: user.role === "end-user" ? "end_user" : user.role,
    active: user.active !== false && user.suspended !== true,
    roleNames: roleNamesOf(user, customRoles),
    permissions: {
      publicReplies,
      ticketAccess: user.role === "admin" ? "all" : (user.ticket_restriction ?? "all"),
    },
  };
}

export function toTicket(ticket: ZendeskTicket, users: Map<number, ZendeskUser>): ExternalTicket {
  const requester = ticket.requester_id === null ? undefined : users.get(ticket.requester_id);
  return {
    externalId: String(ticket.id),
    subject: ticket.subject || "(no subject)",
    status: fromZendeskStatus(ticket.status),
    priority: ticket.priority,
    requester: requester ? toCustomer(requester) : null,
    assigneeExternalId: ticket.assignee_id === null ? null : String(ticket.assignee_id),
    createdAt: new Date(ticket.created_at),
    updatedAt: new Date(ticket.updated_at),
    deleted: ticket.status === "deleted",
  };
}

export function toComment(comment: ZendeskComment, users: Map<number, ZendeskUser>): ExternalComment {
  const author = users.get(comment.author_id);
  return {
    externalId: String(comment.id),
    body: comment.plain_body ?? comment.body,
    public: comment.public,
    author: {
      externalId: author ? String(author.id) : null,
      name: author?.name ?? "System",
      type: !author ? "system" : author.role === "end-user" ? "customer" : "agent",
    },
    createdAt: new Date(comment.created_at),
  };
}

export function indexUsers(users: ZendeskUser[] | undefined): Map<number, ZendeskUser> {
  return new Map((users ?? []).map((user) => [user.id, user]));
}
