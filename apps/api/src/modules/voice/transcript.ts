import type { CallTranscriptLine } from "@oneix/contracts";

/** One line of a call transcript. */
export interface TranscriptLine {
  speaker: "Customer" | "AI agent";
  text: string;
  /** When it was said (ISO), if the turn has a timestamp. */
  at?: string;
}

/** Zendesk comments are limited to 64 KB; the note stays well under it. */
const MAX_NOTE_CHARACTERS = 60_000;

const CUSTOMER_ROLES = ["user", "customer", "human", "input", "caller"];
const AI_ROLES = ["assistant", "bot", "ai", "output", "agent", "system"];

/**
 * Reads a transcript sent by the Cognigy Flow: the Get Transcript node's output (an array of turns,
 * possibly wrapped in an object, or the same as a JSON string), or plain text. Each turn's text
 * comes from `text`, `payload.text`, or `data.text`; its speaker from `role`, `source`, or `type`.
 * Turns without text are skipped.
 */
export function transcriptLines(transcript: unknown): TranscriptLine[] | string {
  if (typeof transcript === "string") {
    // CognigyScript in a JSON body often turns the Get Transcript output into a JSON string.
    const text = transcript.trim();
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return transcriptLines(JSON.parse(text));
      } catch {
        // Plain text that happens to start with a bracket.
      }
    }
    return text;
  }
  const turns = Array.isArray(transcript) ? transcript : turnsIn(transcript);
  const lines: TranscriptLine[] = [];
  for (const turn of turns) {
    if (typeof turn !== "object" || turn === null) continue;
    const record = turn as Record<string, unknown>;
    const text = textOf(record);
    if (!text) continue;
    const at = timeOf(record.timestamp);
    lines.push(at ? { speaker: speakerOf(record), text, at } : { speaker: speakerOf(record), text });
  }
  return lines;
}

/** The internal note added to the ticket when the AI agent hands the call over. */
export function transcriptNote(transcript: unknown, reason?: string): string {
  const read = transcriptLines(transcript);
  const body =
    typeof read === "string" ? read : read.map((line) => `${line.speaker}: ${line.text}`).join("\n\n");
  const parts = [
    "Call transcript: AI agent and customer, before the handover",
    body || "(The AI agent sent no transcript.)",
  ];
  if (reason?.trim()) parts.push(`Handover reason: ${reason.trim()}`);
  const note = parts.join("\n\n");
  return note.length > MAX_NOTE_CHARACTERS
    ? `${note.slice(0, MAX_NOTE_CHARACTERS)}\n\n(Transcript shortened.)`
    : note;
}

/** The live transcript kept on the call, from what the Flow sent; plain text becomes one line. */
export function callTranscript(transcript: unknown): CallTranscriptLine[] {
  const read = transcriptLines(transcript);
  if (typeof read === "string") return read ? [{ speaker: "ai", text: read, at: null }] : [];
  return read.map((line) => ({
    speaker: line.speaker === "Customer" ? "customer" : "ai",
    text: line.text,
    at: line.at ?? null,
  }));
}

function turnsIn(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  for (const key of ["transcript", "turns", "messages", "steps"]) {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

function textOf(turn: Record<string, unknown>): string {
  const candidates = [turn.text, nested(turn.payload, "text"), nested(turn.data, "text"), turn.message];
  const text = candidates.find((c): c is string => typeof c === "string" && c.trim() !== "");
  return text?.trim() ?? "";
}

function speakerOf(turn: Record<string, unknown>): TranscriptLine["speaker"] {
  for (const key of ["role", "source", "type"]) {
    const value = turn[key];
    if (typeof value !== "string") continue;
    const role = value.toLowerCase();
    if (CUSTOMER_ROLES.includes(role)) return "Customer";
    if (AI_ROLES.includes(role)) return "AI agent";
  }
  return "AI agent";
}

function timeOf(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function nested(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}
