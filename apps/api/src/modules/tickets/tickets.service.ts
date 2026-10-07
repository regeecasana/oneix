import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddNoteRequest,
  ListTicketsQuery,
  ListTicketsResponse,
  TicketDetail,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type Prisma, type PrismaClient } from "@oneix/db";
import type { Actor, TicketChanges, TicketingProvider } from "@oneix/ticketing";
import type { z } from "zod";
import type { SessionUser } from "../../common/auth.js";
import { decodeCursor, encodeCursor } from "../../common/cursor.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";
import { AuditService } from "../audit/audit.service.js";
import { type TicketRow, ticketInclude, toThreadEntry, toTicketSummary } from "./tickets.mapper.js";

type ListQuery = z.output<typeof ListTicketsQuery>;

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly ticketing: TicketingProvider,
    private readonly audit: AuditService,
  ) {}

  /** Inbox list, served from the cache. */
  async list(user: SessionUser, query: ListQuery): Promise<ListTicketsResponse> {
    const where: Prisma.TicketWhereInput = { tenantId: user.tenantId };
    if (query.status) where.status = query.status;
    if (query.assignee === "me") where.assigneeId = user.id;
    else if (query.assignee === "unassigned") where.assigneeId = null;
    else if (query.assignee) where.assigneeId = query.assignee;

    if (query.cursor) {
      const { updatedAt, id } = decodeCursor(query.cursor);
      where.OR = [
        { externalUpdatedAt: { lt: updatedAt } },
        { externalUpdatedAt: updatedAt, id: { lt: id } },
      ];
    }

    const rows = await this.prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ externalUpdatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toTicketSummary),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ updatedAt: last.externalUpdatedAt, id: last.id }) : null,
    };
  }

  /** Ticket with its thread. Reads the backend directly and refreshes the cache on the way. */
  async get(user: SessionUser, id: string): Promise<TicketDetail> {
    const cached = await this.findOrThrow(user, id);
    const [fresh, comments] = await Promise.all([
      this.ticketing.getTicket(cached.externalId),
      this.ticketing.getThread(cached.externalId),
    ]);

    if (!fresh) {
      await this.prisma.ticket.delete({ where: { id: cached.id } });
      throw new NotFoundException("Ticket not found");
    }
    await cacheTicketSnapshot(this.prisma, user.tenantId, fresh);
    const row = await this.findOrThrow(user, id);

    const authorIds = [...new Set(comments.flatMap((c) => (c.author.externalId ? [c.author.externalId] : [])))];
    const agents = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, zendeskUserId: { in: authorIds } },
      select: { zendeskUserId: true, name: true },
    });
    const agentNames = new Map(agents.map((a) => [a.zendeskUserId!, a.name]));

    return {
      ...toTicketSummary(row),
      thread: comments.map((comment) => toThreadEntry(comment, agentNames)),
    };
  }

  async update(user: SessionUser, id: string, request: UpdateTicketRequest): Promise<TicketSummary> {
    const cached = await this.findOrThrow(user, id);

    const changes: TicketChanges = { status: request.status, priority: request.priority };
    if (request.assigneeId !== undefined) {
      changes.assigneeExternalId = request.assigneeId === null ? null : await this.assigneeExternalId(user, request.assigneeId);
    }

    const updated = await this.ticketing.updateTicket(cached.externalId, changes, actorOf(user));
    await cacheTicketSnapshot(this.prisma, user.tenantId, updated);

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: "ticket.updated",
      targetType: "ticket",
      targetId: cached.id,
      metadata: { ...request },
    });

    return toTicketSummary(await this.findOrThrow(user, id));
  }

  async addNote(user: SessionUser, id: string, note: AddNoteRequest): Promise<void> {
    const cached = await this.findOrThrow(user, id);
    await this.ticketing.addNote(cached.externalId, note, actorOf(user));
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: "ticket.note_added",
      targetType: "ticket",
      targetId: cached.id,
    });
  }

  private async findOrThrow(user: SessionUser, id: string): Promise<TicketRow> {
    const row = await this.prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      include: ticketInclude,
    });
    if (!row) throw new NotFoundException("Ticket not found");
    return row;
  }

  private async assigneeExternalId(user: SessionUser, assigneeId: string): Promise<string> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: assigneeId, tenantId: user.tenantId },
      select: { zendeskUserId: true },
    });
    if (!assignee) throw new BadRequestException("Unknown assignee");
    if (!assignee.zendeskUserId) {
      throw new BadRequestException("This agent isn't set up to receive tickets yet");
    }
    return assignee.zendeskUserId;
  }
}

function actorOf(user: SessionUser): Actor {
  return { email: user.email, externalUserId: user.zendeskUserId };
}
