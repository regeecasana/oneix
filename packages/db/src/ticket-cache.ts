import type { TicketPriority, TicketStatus } from "@oneix/contracts";
import type { PrismaClient } from "./generated/prisma/client.js";

/**
 * A ticket as read from the ticketing backend, in vendor-neutral form.
 * Structurally matches `ExternalTicket` from `@oneix/ticketing`, so callers pass it straight through.
 */
export interface TicketSnapshot {
  externalId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  requester: {
    externalId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  assigneeExternalId: string | null;
  updatedAt: Date;
  deleted: boolean;
}

export type CacheResult =
  | { outcome: "written"; ticketId: string }
  | { outcome: "stale"; ticketId: string }
  | { outcome: "deleted" };

/**
 * Writes a backend snapshot into the ticket cache.
 * A snapshot older than the cached row is ignored, so out-of-order webhooks and backfills are safe.
 */
export async function cacheTicketSnapshot(
  prisma: PrismaClient,
  tenantId: string,
  snapshot: TicketSnapshot,
): Promise<CacheResult> {
  const where = { tenantId_externalId: { tenantId, externalId: snapshot.externalId } };

  if (snapshot.deleted) {
    await prisma.ticket.deleteMany({ where: { tenantId, externalId: snapshot.externalId } });
    return { outcome: "deleted" };
  }

  const customer = snapshot.requester
    ? await prisma.customer.upsert({
        where: { tenantId_externalId: { tenantId, externalId: snapshot.requester.externalId } },
        create: { tenantId, ...snapshot.requester },
        update: {
          name: snapshot.requester.name,
          email: snapshot.requester.email,
          phone: snapshot.requester.phone,
        },
        select: { id: true },
      })
    : null;

  // Assignees the backend knows but oneix has no user for are cached as unassigned.
  const assignee = snapshot.assigneeExternalId
    ? await prisma.tenantMembership.findUnique({
        where: { tenantId_zendeskUserId: { tenantId, zendeskUserId: snapshot.assigneeExternalId } },
        select: { userId: true },
      })
    : null;

  const now = new Date();
  const data = {
    subject: snapshot.subject,
    status: snapshot.status,
    priority: snapshot.priority,
    customerId: customer?.id ?? null,
    assigneeId: assignee?.userId ?? null,
    externalUpdatedAt: snapshot.updatedAt,
    lastSyncedAt: now,
  };

  const updated = await prisma.ticket.updateMany({
    where: { tenantId, externalId: snapshot.externalId, externalUpdatedAt: { lte: snapshot.updatedAt } },
    data,
  });

  if (updated.count === 0) {
    const existing = await prisma.ticket.findUnique({ where, select: { id: true } });
    if (existing) return { outcome: "stale", ticketId: existing.id };

    const created = await prisma.ticket.upsert({
      where,
      create: { tenantId, externalId: snapshot.externalId, ...data },
      update: {},
      select: { id: true },
    });
    return { outcome: "written", ticketId: created.id };
  }

  const row = await prisma.ticket.findUniqueOrThrow({ where, select: { id: true } });
  return { outcome: "written", ticketId: row.id };
}
