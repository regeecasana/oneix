import type { TicketStatus } from "@oneix/contracts";
import type { ExternalComment, ExternalCustomer, ExternalTicket } from "../provider.js";
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
