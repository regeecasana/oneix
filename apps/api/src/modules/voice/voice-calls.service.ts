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
  type CallSignal,
  type CallTranscriptLine,
  type CallTranscriptResponse,
  type FlowCallEventRequest,
  type FlowCallEventResponse,
  type FlowCallStartRequest,
  type FlowCallStartResponse,
  type FlowHandoverRequest,
  type FlowHandoverResponse,
  type FlowTranscriptRequest,
  LIVE_CALL_STATES,
  MISSED_CALL_EVENTS,
  type LiveCall,
  type LiveCallsResponse,
  VOICE_SIP_HEADERS,
  type WidgetCallRequest,
  type WidgetCallResponse,
} from "@oneix/contracts";
import { cacheTicketSnapshot, type Prisma, type PrismaClient, type VoiceCall } from "@oneix/db";
import type { TicketingRegistry } from "@oneix/tenancy";
import { randomBytes } from "node:crypto";
import type { SessionUser } from "../../common/auth.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuditService } from "../audit/audit.service.js";
import { PresenceService } from "./presence.service.js";
import { callTranscript, transcriptNote } from "./transcript.js";
import { VoiceEventsService } from "./voice-events.service.js";

/** Calls started per address in a window, against someone filling Zendesk with tickets. */
const WIDGET_CALLS_PER_WINDOW = 10;
const WIDGET_WINDOW_MS = 10 * 60_000;
/** Voice Gateway rings at most this many agents at once. */
const MAX_DIAL_TARGETS = 10;
/** Calls that never ended cleanly drop off the live list after this long. */
const LIVE_CALL_MAX_AGE_MS = 6 * 3600_000;
/**
 * When a call is taken as over without hearing so: the widget's call never connected, the AI agent
 * stopped taking turns (each turn updates the call), or an agent's call outlived any real call.
 */
const CONNECTING_TIMEOUT_MS = 3 * 60_000;
const AI_IDLE_TIMEOUT_MS = 15 * 60_000;
const AGENT_CALL_TIMEOUT_MS = 4 * 3600_000;
/** After the ring timeout, how long a handed-over call may still wait before it counts as missed. */
const QUEUED_GRACE_MS = 2 * 60_000;

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
      select: {
        id: true,
        connections: { where: { provider: "zendesk", status: { not: "disabled" } }, select: { id: true } },
      },
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
    this.logger.log(`call #${call.ticketNumber}: started from the website by ${request.name}`);
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
    this.logger.log(`call #${call.ticketNumber}: the AI agent answered`);
    return {
      ticketNumber: call.ticketNumber,
      customerName: call.customerName,
      firstName: call.customerName.split(/\s+/)[0] ?? call.customerName,
    };
  }

  /**
   * The AI agent hands the call over: the Flow gets the available agents' softphones to ring at once,
   * right away, and the transcript then goes on the ticket as an internal note. The note is written
   * after answering, since Zendesk can take longer than the Flow waits.
   */
  async flowHandover(token: string, request: FlowHandoverRequest): Promise<FlowHandoverResponse> {
    const call = await this.byToken(token);
    // The AI agent may ask again (the caller insists, or a ring went unanswered): ring again, but
    // the ticket gets its transcript note only from the first handover.
    const first = await this.prisma.voiceCall.updateMany({
      where: { id: call.id, handedOverAt: null },
      data: { handedOverAt: new Date() },
    });
    await this.prisma.voiceCall.update({
      where: { id: call.id },
      data: {
        state: "queued",
        startedAt: call.startedAt ?? new Date(),
        transcript: callTranscript(request.transcript) as Prisma.InputJsonValue,
      },
    });
    if (first.count > 0) void this.addTranscriptNote(call, request);
    await this.changed(call.tenantId);

    const targets = (await this.answerableAgents(call.tenantId))
      .map((userId) => this.presence.dialName(call.tenantId, userId))
      .filter((name): name is string => name !== null)
      .slice(0, MAX_DIAL_TARGETS)
      .map((name) => ({ type: "user" as const, name }));
    this.logger.log(
      `call #${call.ticketNumber}: handover${first.count > 0 ? "" : " (again)"}, ringing ${targets.length} agent(s)${
        targets.length ? `: ${targets.map((t) => t.name).join(", ")}` : ""
      }`,
    );
    // Nobody to ring: the call is missed now, and the AI agent tells the caller. Otherwise, if nobody
    // answers in time, the caller's widget is told.
    if (targets.length === 0) await this.flowMissed(token);
    else this.whenRingTimesOut(call.id);
    return {
      ticketNumber: call.ticketNumber,
      targets,
      headers: { [VOICE_SIP_HEADERS.call]: call.id, [VOICE_SIP_HEADERS.ticket]: String(call.ticketNumber) },
      timeout: this.config.VOICE_RING_TIMEOUT_SECONDS,
      say:
        targets.length > 0
          ? "Connecting you with a colleague now. Please stay on the line; they'll have everything you told me."
          : busyMessage(call.ticketNumber),
    };
  }

  /**
   * A Voice Gateway call event, passed on by the Flow as is. oneix decides what it means, so the
   * Flow needs no branches: the call ended, or the agents' phones rang out (missed, say busy).
   */
  async flowEvent(token: string, request: FlowCallEventRequest): Promise<FlowCallEventResponse> {
    const event = request.event.toUpperCase();
    this.logger.log(`call ${token.slice(0, 12)}…: Voice Gateway event ${event}`);
    if ((MISSED_CALL_EVENTS as readonly string[]).includes(event)) {
      await this.flowMissed(token);
      const call = await this.byToken(token);
      return { action: "busy", say: busyMessage(call.ticketNumber) };
    }
    if (event === "CALL_COMPLETED" || event === "CALL_FAILED") await this.flowEnded(token);
    else await this.byToken(token);
    return { action: "none", say: null };
  }

  /**
   * The conversation so far, sent by the Flow after each of the AI agent's turns. Kept on the call
   * and announced, so the ticket shows it live; Zendesk gets it once, as the handover note.
   */
  async flowTranscript(token: string, request: FlowTranscriptRequest): Promise<void> {
    const call = await this.byToken(token);
    const lines = callTranscript(request.transcript);
    // Get Transcript returns only the latest turns; keep the longer one.
    if (lines.length < storedTranscript(call).length) return;
    await this.prisma.voiceCall.update({
      where: { id: call.id },
      data: { transcript: lines as Prisma.InputJsonValue },
    });
    await this.events.publish(call.tenantId, { type: "call.transcript", callId: call.id });
  }

  /** A call's conversation with the AI agent, for the ticket. */
  async transcript(user: SessionUser, id: string): Promise<CallTranscriptResponse> {
    const call = await this.prisma.voiceCall.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!call) throw new NotFoundException("Unknown call");
    return { lines: storedTranscript(call) };
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
    // With an agent, the call no longer runs through Voice Gateway: the widget hung up there on
    // purpose to talk to the agent directly. The agent or the caller ends it.
    if (call.state === "agent") return;
    await this.finish(call);
  }

  /** The customer's widget, listening for its call's events: checks the call token. */
  async callForWidget(token: string): Promise<VoiceCall> {
    return this.byToken(token);
  }

  /** The widget's side of setting up the direct call, relayed to the agent on it. */
  async signalFromWidget(token: string, signal: CallSignal): Promise<void> {
    const call = await this.byToken(token);
    if (call.state !== "agent") throw new ConflictException("No agent is on this call");
    if (signal.type !== "candidate") this.logger.log(`call #${call.ticketNumber}: the caller's ${signal.type} goes to the agent`);
    await this.events.publish(call.tenantId, { type: "call.signal", callId: call.id, signal });
  }

  /** The agent's side of setting up the direct call, relayed to the customer's widget. */
  async signalFromAgent(user: SessionUser, id: string, signal: CallSignal): Promise<void> {
    const call = await this.prisma.voiceCall.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!call) throw new NotFoundException("Call not found");
    if (call.state !== "agent" || call.agentId !== user.id)
      throw new ConflictException("You're not on this call");
    if (signal.type !== "candidate") this.logger.log(`call #${call.ticketNumber}: the agent's ${signal.type} goes to the caller`);
    await this.events.publishToCall(call.id, { type: "signal", signal });
  }

  /**
   * The customer hung up, from the website's widget. The call token, which only that caller has,
   * is the authorization. Ending an ended call is fine.
   */
  async endFromWidget(token: string): Promise<void> {
    const call = await this.prisma.voiceCall.findUnique({ where: { token } });
    if (call) await this.finish(call, "the caller");
  }

  /** Calls in progress in the agent's workspace. */
  async live(user: SessionUser): Promise<LiveCallsResponse> {
    await this.expireStale(user.tenantId);
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
    const call = await this.prisma.voiceCall.findFirst({
      where: { id, tenantId: user.tenantId },
      include: callInclude,
    });
    if (!call) throw new NotFoundException("Call not found");
    if (taken.count === 0 && call.agentId !== user.id)
      throw new ConflictException("Another agent took this call");

    if (taken.count > 0) {
      this.logger.log(`call #${call.ticketNumber}: answered by ${user.name ?? user.id}`);
      // The widget switches the call over to this agent.
      await this.events.publishToCall(call.id, {
        type: "agent.answered",
        agentName: user.name.split(/s+/)[0] ?? user.name,
        iceServers: this.config.VOICE_ICE_SERVERS,
      });
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
    await this.finish(call, "the agent");
    await this.events.publishToCall(call.id, { type: "call.ended" });
  }

  private async finish(call: VoiceCall, by = "the Flow"): Promise<void> {
    if (call.state === "ended") return;
    this.logger.log(`call #${call.ticketNumber}: ended by ${by}`);
    await this.prisma.voiceCall.update({
      where: { id: call.id },
      // A missed call stays missed, so it can be told apart from one an agent took.
      data: { state: call.state === "missed" ? "missed" : "ended", endedAt: new Date() },
    });
    await this.changed(call.tenantId);
  }

  /**
   * Ends calls nobody said ended: Cognigy may not pass the hang-up on, and a closed browser can't.
   * Run before calls are listed or agents are rung, so neither waits on a call that's long gone.
   */
  private async expireStale(tenantId: string): Promise<void> {
    const now = Date.now();
    const before = (ms: number) => new Date(now - ms);
    const ended = await this.prisma.voiceCall.updateMany({
      where: {
        tenantId,
        OR: [
          { state: "connecting", createdAt: { lt: before(CONNECTING_TIMEOUT_MS) } },
          { state: "ai", updatedAt: { lt: before(AI_IDLE_TIMEOUT_MS) } },
          { state: "agent", updatedAt: { lt: before(AGENT_CALL_TIMEOUT_MS) } },
        ],
      },
      data: { state: "ended", endedAt: new Date(now) },
    });
    const missed = await this.prisma.voiceCall.updateMany({
      where: {
        tenantId,
        state: "queued",
        handedOverAt: { lt: before(this.config.VOICE_RING_TIMEOUT_SECONDS * 1000 + QUEUED_GRACE_MS) },
      },
      data: { state: "missed", endedAt: new Date(now) },
    });
    if (ended.count + missed.count > 0) await this.changed(tenantId);
  }

  /** Available agents who can act on tickets and aren't on another call. */
  private async answerableAgents(tenantId: string): Promise<string[]> {
    await this.expireStale(tenantId);
    const available = await this.presence.available(tenantId);
    if (available.length === 0) return [];
    const [members, busy] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where: {
          tenantId,
          active: true,
          userId: { in: available },
          zendeskUserId: { not: null },
          user: { status: "active" },
        },
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

  /**
   * Marks a handed-over call missed if no agent answered within the ring timeout, and tells the
   * caller's widget. In memory: a restart in between leaves it to expireStale.
   */
  private whenRingTimesOut(callId: string): void {
    setTimeout(() => {
      void (async () => {
        const missed = await this.prisma.voiceCall.updateMany({
          where: { id: callId, state: "queued" },
          data: { state: "missed", endedAt: new Date() },
        });
        if (missed.count === 0) return;
        const call = await this.prisma.voiceCall.findUnique({ where: { id: callId } });
        if (!call) return;
        this.logger.log(`call #${call.ticketNumber}: nobody answered`);
        await this.events.publishToCall(call.id, {
          type: "call.missed",
          message: `All our agents are busy right now. Your reference is #${call.ticketNumber}; we'll get back to you by email.`,
        });
        await this.changed(call.tenantId);
      })().catch((error: unknown) => this.logger.error({ err: error }, "couldn't time out a ringing call"));
    }, this.config.VOICE_RING_TIMEOUT_SECONDS * 1000);
  }

  private async addTranscriptNote(call: VoiceCall, request: FlowHandoverRequest): Promise<void> {
    try {
      const ticketing = await this.registry.for(call.tenantId);
      const updated = await ticketing.addComment(call.ticketExternalId, {
        body: transcriptNote(request.transcript, request.reason),
        public: false,
      });
      await cacheTicketSnapshot(this.prisma, call.tenantId, updated);
    } catch (error) {
      this.logger.error(
        { err: error, ticket: call.ticketNumber },
        "couldn't add the call transcript to the ticket",
      );
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

/** What the AI agent says when no agent can take the call. Reference digits are read one by one. */
export function busyMessage(ticketNumber: number): string {
  const digits = String(ticketNumber).split("").join(" ");
  return `Sorry, all our agents are busy right now. Your reference number is ${digits}. We'll get back to you by email. Thank you for calling.`;
}

function storedTranscript(call: VoiceCall): CallTranscriptLine[] {
  return Array.isArray(call.transcript) ? (call.transcript as unknown as CallTranscriptLine[]) : [];
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
