import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddCommentRequest,
  ListTicketsQuery,
  ListTicketsResponse,
  TicketDetail,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type Prisma, type PrismaClient, scopedToTenant, type TenantDb } from "@oneix/db";
import type { TicketingRegistry } from "@oneix/tenancy";
import type { Actor, TicketChanges, TicketingProvider } from "@oneix/ticketing";
import type { z } from "zod";
import type { SessionUser } from "../../common/auth.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";
import { AuditService } from "../audit/audit.service.js";
import { type TicketRow, ticketInclude, toThreadEntry, toTicketSummary } from "./tickets.mapper.js";

type ListQuery = z.output<typeof ListTicketsQuery>;

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly registry: TicketingRegistry,
    private readonly audit: AuditService,
  ) {}

  /** Inbox list, served from the cache, one page at a time, newest activity first. */
  async list(user: SessionUser, query: ListQuery): Promise<ListTicketsResponse> {
    const db = this.db(user);
    const where: Prisma.TicketWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assignee === "me") where.assigneeId = user.id;
    else if (query.assignee === "unassigned") where.assigneeId = null;
    else if (query.assignee) where.assigneeId = query.assignee;

    const [total, rows] = await db.$transaction([
      db.ticket.count({ where }),
      db.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ externalUpdatedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map(toTicketSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /** Ticket with its thread. Reads the backend directly and refreshes the cache on the way. */
  async get(user: SessionUser, id: string): Promise<TicketDetail> {
    const db = this.db(user);
    const cached = await this.findOrThrow(user, id);
    const ticketing = await this.ticketing(user);
    const [fresh, comments] = await Promise.all([
      ticketing.getTicket(cached.externalId),
      ticketing.getThread(cached.externalId),
    ]);

    if (!fresh) {
      await db.ticket.delete({ where: { id: cached.id } });
      throw new NotFoundException("Ticket not found");
    }
    await cacheTicketSnapshot(this.prisma, user.tenantId, fresh);
    const row = await this.findOrThrow(user, id);

    const authorIds = [...new Set(comments.flatMap((c) => (c.author.externalId ? [c.author.externalId] : [])))];
    const agents = await db.tenantMembership.findMany({
      where: { zendeskUserId: { in: authorIds } },
      select: { zendeskUserId: true, user: { select: { name: true } } },
    });
    const agentNames = new Map(agents.map((a) => [a.zendeskUserId!, a.user.name]));

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

    const ticketing = await this.ticketing(user);
    const updated = await ticketing.updateTicket(cached.externalId, changes, actorOf(user));
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

  /** A public reply (sent to the customer by the backend) or an internal note, as the agent. */
  async addComment(user: SessionUser, id: string, comment: AddCommentRequest): Promise<TicketSummary> {
    // The backend would silently turn the reply into an internal note; say so instead.
    if (comment.public && !user.canReplyPublicly) {
      throw new ForbiddenException("Your role can add internal notes only, not public replies");
    }
    const cached = await this.findOrThrow(user, id);
    const ticketing = await this.ticketing(user);
    const updated = await ticketing.addComment(cached.externalId, comment, actorOf(user));
    await cacheTicketSnapshot(this.prisma, user.tenantId, updated);

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: comment.public ? "ticket.replied" : "ticket.note_added",
      targetType: "ticket",
      targetId: cached.id,
      metadata: comment.status ? { status: comment.status } : undefined,
    });

    return toTicketSummary(await this.findOrThrow(user, id));
  }

  /** Database access limited to the agent's tenant. */
  private db(user: SessionUser): TenantDb {
    return scopedToTenant(this.prisma, user.tenantId);
  }

  private ticketing(user: SessionUser): Promise<TicketingProvider> {
    return this.registry.for(user.tenantId);
  }

  private async findOrThrow(user: SessionUser, id: string): Promise<TicketRow> {
    const row = await this.db(user).ticket.findFirst({ where: { id }, include: ticketInclude });
    if (!row) throw new NotFoundException("Ticket not found");
    return row;
  }

  private async assigneeExternalId(user: SessionUser, assigneeId: string): Promise<string> {
    const assignee = await this.db(user).tenantMembership.findFirst({
      where: { userId: assigneeId, active: true },
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
