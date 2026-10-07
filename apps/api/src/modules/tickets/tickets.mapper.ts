import type { ThreadEntry, TicketSummary } from "@oneix/contracts";
import type { Prisma } from "@oneix/db";
import type { ExternalComment } from "@oneix/ticketing";

export const ticketInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  assignee: { select: { id: true, name: true } },
} as const satisfies Prisma.TicketInclude;

export type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function toTicketSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    customer: row.customer,
    assignee: row.assignee,
    updatedAt: row.externalUpdatedAt.toISOString(),
  };
}

/**
 * @param agentNames oneix names keyed by backend user ID, so agents show as they appear in oneix.
 */
export function toThreadEntry(comment: ExternalComment, agentNames: Map<string, string>): ThreadEntry {
  const oneixName = comment.author.externalId ? agentNames.get(comment.author.externalId) : undefined;
  return {
    id: comment.externalId,
    kind: comment.public ? "message" : "internal_note",
    body: comment.body,
    author: { name: oneixName ?? comment.author.name, type: comment.author.type },
    createdAt: comment.createdAt.toISOString(),
  };
}
