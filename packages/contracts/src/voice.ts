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
  tenant: z.string().min(1).max(64).meta({ description: "The client workspace's slug.", example: "con-blinkcx2" }),
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
});
export type FlowHandoverResponse = z.infer<typeof FlowHandoverResponse>;

export const FlowAckResponse = z.object({ ok: z.literal(true) });
export type FlowAckResponse = z.infer<typeof FlowAckResponse>;

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
