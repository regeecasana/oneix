import { z } from "zod";
import { PersonRef } from "./tickets.js";

/**
 * Voice calls answered by the Cognigy AI agent and handed over to oneix agents.
 *
 * A call starts on a client's website (Click To Call): the page sends the caller's name and email,
 * oneix creates the Zendesk ticket and returns a call token. The token is the caller's SIP user in
 * the call, so the Cognigy Flow reads it as `input.userId` and uses it in every request to oneix.
 */

export const VOICE_CALL_STATES = [
  /** The ticket exists; the call hasn't reached the AI agent yet. */
  "connecting",
  /** The AI agent is talking with the caller. */
  "ai",
  /** Handed over; ringing the available agents. */
  "queued",
  /** An agent answered. */
  "agent",
  /** No agent answered; the ticket stays open for a callback. */
  "missed",
  "ended",
] as const;
export const VoiceCallState = z.enum(VOICE_CALL_STATES);
export type VoiceCallState = z.infer<typeof VoiceCallState>;

/** States shown as live calls. */
export const LIVE_CALL_STATES = ["ai", "queued", "agent"] as const satisfies readonly VoiceCallState[];

/** Names and emails as the caller types them on the website. */
export const WidgetCallRequest = z.object({
  tenant: z
    .string()
    .min(1)
    .max(64)
    .meta({ description: "The client workspace's slug.", example: "con-blinkcx2" }),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
});
export type WidgetCallRequest = z.infer<typeof WidgetCallRequest>;

export const WidgetCallResponse = z.object({
  /** Pass as `userId` to the Click To Call SDK. */
  callToken: z.string(),
  ticketNumber: z.number().int(),
});
export type WidgetCallResponse = z.infer<typeof WidgetCallResponse>;

/** What the Cognigy Flow sends when the AI agent answers. Extra fields are ignored. */
export const FlowCallStartRequest = z.looseObject({
  sessionId: z.string().max(200).optional(),
  callId: z.string().max(200).optional().meta({ description: "Voice Gateway's call ID, for support." }),
});
export type FlowCallStartRequest = z.infer<typeof FlowCallStartRequest>;

export const FlowCallStartResponse = z.object({
  ticketNumber: z.number().int(),
  customerName: z.string(),
  /** For a personal greeting. */
  firstName: z.string(),
});
export type FlowCallStartResponse = z.infer<typeof FlowCallStartResponse>;

export const FlowHandoverRequest = z.looseObject({
  /**
   * The conversation so far: the Get Transcript node's output, an array of turns, or plain text.
   * Turns are read leniently: the text from `text` or `payload.text`, the speaker from `role`,
   * `source`, or `type`.
   */
  transcript: z.unknown(),
  reason: z.string().max(500).optional(),
});
export type FlowHandoverRequest = z.infer<typeof FlowHandoverRequest>;

export const DialTarget = z.object({ type: z.literal("user"), name: z.string() });
export type DialTarget = z.infer<typeof DialTarget>;

export const FlowHandoverResponse = z.object({
  ticketNumber: z.number().int(),
  /** Every available agent's softphone, to ring at once; empty when nobody is available. */
  targets: z.array(DialTarget),
  /** SIP headers for the dial, so the agent's softphone knows the call and ticket. */
  headers: z.record(z.string(), z.string()),
  /** Seconds to ring before giving up. */
  timeout: z.number().int(),
  /**
   * What the AI agent says now: that it's connecting the caller, or, when nobody is available, that
   * agents are busy (the call is then marked missed; hang up after saying it).
   */
  say: z.string(),
});
export type FlowHandoverResponse = z.infer<typeof FlowHandoverResponse>;

export const FlowAckResponse = z.object({ ok: z.literal(true) });
export type FlowAckResponse = z.infer<typeof FlowAckResponse>;

/** A Voice Gateway call event the Flow received, such as `CALL_COMPLETED` or `NO_ANSWER`. */
export const FlowCallEventRequest = z.looseObject({
  event: z.string().min(1).max(100),
});
export type FlowCallEventRequest = z.infer<typeof FlowCallEventRequest>;

export const FlowCallEventResponse = z.object({
  /** `busy`: no agent answered; say `say`, then hang up. `none`: nothing to do. */
  action: z.enum(["busy", "none"]),
  say: z.string().nullable(),
});
export type FlowCallEventResponse = z.infer<typeof FlowCallEventResponse>;

/** Voice Gateway events meaning the agents' phones rang out or refused. */
export const MISSED_CALL_EVENTS = [
  "NO_ANSWER",
  "USER_BUSY",
  "TRANSFER_DIAL_ERROR",
  "TRANSFER_REFER_ERROR",
] as const;

/** The conversation so far, sent by the Flow after each of the AI agent's turns. */
export const FlowTranscriptRequest = z.looseObject({
  /** The Get Transcript node's output, read like the handover's `transcript`. */
  transcript: z.unknown(),
});
export type FlowTranscriptRequest = z.infer<typeof FlowTranscriptRequest>;

/** One line of the conversation with the AI agent. */
export const CallTranscriptLine = z.object({
  speaker: z.enum(["customer", "ai"]),
  text: z.string(),
  /** When it was said, if the Flow sent it. */
  at: z.iso.datetime().nullable(),
});
export type CallTranscriptLine = z.infer<typeof CallTranscriptLine>;

export const CallTranscriptResponse = z.object({ lines: z.array(CallTranscriptLine) });
export type CallTranscriptResponse = z.infer<typeof CallTranscriptResponse>;

/** A call as agents see it. */
export const LiveCall = z.object({
  id: z.string(),
  ticketNumber: z.number().int(),
  customerName: z.string(),
  customerEmail: z.string(),
  state: VoiceCallState,
  startedAt: z.iso.datetime().nullable(),
  handedOverAt: z.iso.datetime().nullable(),
  answeredAt: z.iso.datetime().nullable(),
  agent: PersonRef.nullable(),
});
export type LiveCall = z.infer<typeof LiveCall>;

export const LiveCallsResponse = z.object({ items: z.array(LiveCall) });
export type LiveCallsResponse = z.infer<typeof LiveCallsResponse>;

export const PRESENCE_STATUSES = ["available", "away"] as const;
export const PresenceStatus = z.enum(PRESENCE_STATUSES);
export type PresenceStatus = z.infer<typeof PresenceStatus>;

export const SetPresenceRequest = z.object({ status: PresenceStatus });
export type SetPresenceRequest = z.infer<typeof SetPresenceRequest>;

/** How the agent's browser softphone registers with Voice Gateway. Short-lived. */
export const SoftphoneCredentials = z.object({
  sipUser: z.string(),
  password: z.string(),
  realm: z.string(),
  wsUri: z.string(),
  /** STUN and TURN servers for the call audio, as RTCPeerConnection takes them. */
  iceServers: z.array(z.lazy(() => IceServer)),
});
export type SoftphoneCredentials = z.infer<typeof SoftphoneCredentials>;

export const PresenceResponse = z.object({
  status: PresenceStatus,
  /** Null when voice isn't set up, or the agent isn't linked to a Zendesk user. */
  softphone: SoftphoneCredentials.nullable(),
  /** Why there is no softphone, for the agent. */
  softphoneUnavailable: z.string().nullable(),
});
export type PresenceResponse = z.infer<typeof PresenceResponse>;

/** SIP headers on calls rung to agents. */
export const VOICE_SIP_HEADERS = { call: "X-Oneix-Call", ticket: "X-Oneix-Ticket" } as const;

/**
 * Setting up the direct call between the customer's widget and the agent's browser after a
 * handover: the WebRTC offer and answer, and network candidates as they're found. oneix relays them.
 */
export const CallSignal = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(20_000) }),
  z.object({
    type: z.literal("candidate"),
    /** Null once the sender has found all its candidates. */
    candidate: z
      .object({
        candidate: z.string().max(1_000),
        sdpMid: z.string().nullable().optional(),
        sdpMLineIndex: z.number().int().nullable().optional(),
        usernameFragment: z.string().nullable().optional(),
      })
      .nullable(),
  }),
]);
export type CallSignal = z.infer<typeof CallSignal>;

/** STUN and TURN servers, as RTCPeerConnection takes them. */
export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof IceServer>;

/** What the customer's widget hears about its call, on GET /widget/calls/{token}/events. */
export type WidgetCallEvent =
  /** An agent answered: wait for their offer, then switch the call over to them. */
  | { type: "agent.answered"; agentName: string; iceServers: IceServer[] }
  | { type: "signal"; signal: CallSignal }
  /** The agent hung up. */
  | { type: "call.ended" }
  /** Nobody answered in time; the ticket stays open for a callback. */
  | { type: "call.missed"; message: string }
  | { type: "ping" };
