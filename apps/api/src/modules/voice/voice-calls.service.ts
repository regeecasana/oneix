import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  type FlowCallStartRequest,
  type FlowCallStartResponse,
  type FlowHandoverRequest,
  type FlowHandoverResponse,
  LIVE_CALL_STATES,
  type LiveCall,
  type LiveCallsResponse,
  VOICE_SIP_HEADERS,
  type WidgetCallRequest,
  type WidgetCallResponse,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type PrismaClient, type VoiceCall } from "@oneix/db";
import type { TicketingRegistry } from "@oneix/tenancy";
import { randomBytes } from "node:crypto";
import type { SessionUser } from "../../common/auth.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuditService } from "../audit/audit.service.js";
import { PresenceService } from "./presence.service.js";
import { transcriptNote } from "./transcript.js";
import { VoiceEventsService } from "./voice-events.service.js";

/** Calls started per address in a window, against someone filling Zendesk with tickets. */
const WIDGET_CALLS_PER_WINDOW = 10;
const WIDGET_WINDOW_MS = 10 * 60_000;
/** Voice Gateway rings at most this many agents at once. */
const MAX_DIAL_TARGETS = 10;
/** Calls that never ended cleanly drop off the live list after this long. */
const LIVE_CALL_MAX_AGE_MS = 6 * 3600_000;

const callInclude = { agent: { select: { id: true, name: true } } } as const;
type CallRow = VoiceCall & { agent: { id: string; name: string } | null };

/**
 * A voice call from start to end: the website starts it (ticket and token), the Cognigy Flow
 * reports its progress, and agents answer it. Every change is announced to the workspace live.
 */
@Injectable()
export class VoiceCallsService {
  private readonly logger = new Logger(VoiceCallsService.name);
  /** Recent widget calls per address. In memory, so per API instance. */
  private readonly widgetCalls = new Map<string, number[]>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly registry: TicketingRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly presence: PresenceService,
    private readonly events: VoiceEventsService,
    private readonly audit: AuditService,
  ) {}

  /** The website's call form: finds or creates the customer, opens the ticket, and issues the call token. */
  async startFromWidget(request: WidgetCallRequest, address: string): Promise<WidgetCallResponse> {
    this.limitWidgetCalls(address);
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: request.tenant },
      select: { id: true, connections: { where: { provider: "zendesk", status: { not: "disabled" } }, select: { id: true } } },
    });
    if (!tenant || tenant.connections.length === 0) throw new NotFoundException("Unknown workspace");

    const ticketing = await this.registry.for(tenant.id);
    const customer = await ticketing.findOrCreateCustomer({ name: request.name, email: request.email });
    const ticket = await ticketing.createTicket({
      requesterExternalId: customer.externalId,
      subject: `Call from ${request.name}`,
      description: `${request.name} (${request.email}) started a call from the website. The AI agent answers first.`,
      tags: ["oneix_voice", "web_call"],
    });
    await cacheTicketSnapshot(this.prisma, tenant.id, ticket);

    const call = await this.prisma.voiceCall.create({
      data: {
        tenantId: tenant.id,
        // The caller's SIP user in the call: letters, digits, and dashes only.
        token: `oneix-${randomBytes(15).toString("hex")}`,
        ticketExternalId: ticket.externalId,
        ticketNumber: ticket.number,
        customerName: request.name,
        customerEmail: request.email.toLowerCase(),
      },
    });
    return { callToken: call.token, ticketNumber: call.ticketNumber };
  }

  /** The AI agent answered. */
  async flowStart(token: string, request: FlowCallStartRequest): Promise<FlowCallStartResponse> {
    const call = await this.byToken(token);
    await this.prisma.voiceCall.update({
      where: { id: call.id },
      data: {
        state: call.state === "connecting" ? "ai" : call.state,
        startedAt: call.startedAt ?? new Date(),
        cognigySessionId: request.sessionId ?? call.cognigySessionId,
        gatewayCallId: request.callId ?? call.gatewayCallId,
      },
    });
    await this.changed(call.tenantId);
    return {
      ticketNumber: call.ticketNumber,
      customerName: call.customerName,
      firstName: call.customerName.split(/\s+/)[0] ?? call.customerName,
    };
  }

  /**
   * The AI agent hands the call over: the transcript goes on the ticket as an internal note, and the
   * Flow gets the available agents' softphones to ring at once.
   */
  async flowHandover(token: string, request: FlowHandoverRequest): Promise<FlowHandoverResponse> {
    const call = await this.byToken(token);
    const ticketing = await this.registry.for(call.tenantId);
    const updated = await ticketing.addComment(call.ticketExternalId, {
      body: transcriptNote(request.transcript, request.reason),
      public: false,
    });
    await cacheTicketSnapshot(this.prisma, call.tenantId, updated);

    await this.prisma.voiceCall.update({
      where: { id: call.id },
      data: { state: "queued", handedOverAt: new Date(), startedAt: call.startedAt ?? new Date() },
    });
    await this.changed(call.tenantId);

    const targets = (await this.answerableAgents(call.tenantId))
      .map((userId) => this.presence.dialName(call.tenantId, userId))
      .filter((name): name is string => name !== null)
      .slice(0, MAX_DIAL_TARGETS)
      .map((name) => ({ type: "user" as const, name }));
    return {
      ticketNumber: call.ticketNumber,
      targets,
      headers: { [VOICE_SIP_HEADERS.call]: call.id, [VOICE_SIP_HEADERS.ticket]: String(call.ticketNumber) },
      timeout: this.config.VOICE_RING_TIMEOUT_SECONDS,
    };
  }

  /** Nobody answered; the ticket stays open for a callback. */
  async flowMissed(token: string): Promise<void> {
    const call = await this.byToken(token);
    if (call.state === "agent" || call.state === "ended") return;
    await this.prisma.voiceCall.update({ where: { id: call.id }, data: { state: "missed" } });
    await this.changed(call.tenantId);
  }

  async flowEnded(token: string): Promise<void> {
    const call = await this.byToken(token);
    await this.finish(call);
  }

  /** Calls in progress in the agent's workspace. */
  async live(user: SessionUser): Promise<LiveCallsResponse> {
    const rows = await this.prisma.voiceCall.findMany({
      where: {
        tenantId: user.tenantId,
        state: { in: [...LIVE_CALL_STATES] },
        updatedAt: { gte: new Date(Date.now() - LIVE_CALL_MAX_AGE_MS) },
      },
      include: callInclude,
      orderBy: { createdAt: "asc" },
    });
    return { items: rows.map(toLiveCall) };
  }

  /** The agent picked up. The first agent wins; the ticket is assigned to them. */
  async answer(user: SessionUser, id: string): Promise<LiveCall> {
    const taken = await this.prisma.voiceCall.updateMany({
      where: { id, tenantId: user.tenantId, state: { in: ["queued", "ai"] } },
      data: { state: "agent", agentId: user.id, answeredAt: new Date() },
    });
    const call = await this.prisma.voiceCall.findFirst({ where: { id, tenantId: user.tenantId }, include: callInclude });
    if (!call) throw new NotFoundException("Call not found");
    if (taken.count === 0 && call.agentId !== user.id) throw new ConflictException("Another agent took this call");

    if (taken.count > 0) {
      await this.assignTicket(user, call);
      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "voice.call_answered",
        targetType: "ticket",
        targetId: String(call.ticketNumber),
      });
      await this.changed(user.tenantId);
    }
    return toLiveCall(call);
  }

  /** The agent hung up; the Flow's own end event may arrive too. */
  async end(user: SessionUser, id: string): Promise<void> {
    const call = await this.prisma.voiceCall.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!call) throw new NotFoundException("Call not found");
    await this.finish(call);
  }

  private async finish(call: VoiceCall): Promise<void> {
    if (call.state === "ended") return;
    await this.prisma.voiceCall.update({
      where: { id: call.id },
      // A missed call stays missed, so it can be told apart from one an agent took.
      data: { state: call.state === "missed" ? "missed" : "ended", endedAt: new Date() },
    });
    await this.changed(call.tenantId);
  }

  /** Available agents who can act on tickets and aren't on another call. */
  private async answerableAgents(tenantId: string): Promise<string[]> {
    const available = await this.presence.available(tenantId);
    if (available.length === 0) return [];
    const [members, busy] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where: { tenantId, active: true, userId: { in: available }, zendeskUserId: { not: null }, user: { status: "active" } },
        select: { userId: true },
      }),
      this.prisma.voiceCall.findMany({
        where: { tenantId, state: "agent", agentId: { in: available } },
        select: { agentId: true },
      }),
    ]);
    const eligible = new Set(members.map((m) => m.userId));
    const onCall = new Set(busy.map((c) => c.agentId));
    return available.filter((userId) => eligible.has(userId) && !onCall.has(userId));
  }

  private async assignTicket(user: SessionUser, call: VoiceCall): Promise<void> {
    if (!user.zendeskUserId) return;
    try {
      const ticketing = await this.registry.for(user.tenantId);
      const updated = await ticketing.updateTicket(
        call.ticketExternalId,
        { assigneeExternalId: user.zendeskUserId },
        { email: user.email, externalUserId: user.zendeskUserId },
      );
      await cacheTicketSnapshot(this.prisma, user.tenantId, updated);
    } catch (error) {
      // The call is answered either way; the agent can assign the ticket by hand.
      this.logger.warn({ err: error, ticket: call.ticketNumber }, "couldn't assign the call's ticket");
    }
  }

  private async byToken(token: string): Promise<VoiceCall> {
    const call = await this.prisma.voiceCall.findUnique({ where: { token } });
    if (!call) throw new NotFoundException("Unknown call");
    return call;
  }

  private async changed(tenantId: string): Promise<void> {
    await this.events.publish(tenantId, { type: "calls.changed" });
  }

  private limitWidgetCalls(address: string): void {
    const now = Date.now();
    const recent = (this.widgetCalls.get(address) ?? []).filter((at) => now - at < WIDGET_WINDOW_MS);
    if (recent.length >= WIDGET_CALLS_PER_WINDOW) {
      throw new HttpException("Too many calls. Try again in a few minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
    this.widgetCalls.set(address, [...recent, now]);
  }
}

function toLiveCall(row: CallRow): LiveCall {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    state: row.state,
    startedAt: row.startedAt?.toISOString() ?? null,
    handedOverAt: row.handedOverAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    agent: row.agent,
  };
}
