"use client"

import type { IWebRTCClient } from "@cognigy/click-to-call-sdk"
import type { CallSignal, IceServer, WidgetCallEvent, WidgetCallResponse } from "@oneix/contracts"
import { ArrowRight, Loader2, Mic, MicOff, Phone, PhoneOff, ShieldCheck, X } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

const ENDPOINT_URL = process.env.NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL ?? ""
const TENANT = process.env.NEXT_PUBLIC_LANDING_TENANT ?? ""

type Phase =
  | { name: "form" }
  | { name: "starting" }
  | { name: "connecting"; ticketNumber: number }
  | { name: "live"; ticketNumber: number; since: number }
  | { name: "ended"; ticketNumber: number | null; reason: string | null }

interface Caption {
  id: number
  who: "You" | "Assistant"
  text: string
}

/**
 * The call widget: name and email, then a voice call from the browser to the AI agent through
 * Cognigy Click To Call. oneix opens a ticket first; its call token travels as the caller's ID, so
 * everything the AI agent says and does lands on that ticket.
 */
export function CallWidget({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>({ name: "form" })
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [muted, setMuted] = useState(false)
  const [captions, setCaptions] = useState<Caption[]>([])
  const clientRef = useRef<IWebRTCClient | null>(null)
  const captionId = useRef(0)
  // The call in progress, to tell oneix when it ends; cleared once told.
  const callTokenRef = useRef<string | null>(null)
  // After a handover: the agent the caller is talking with, directly, outside Voice Gateway.
  const [agentName, setAgentName] = useState<string | null>(null)
  const direct = useRef<DirectCall | null>(null)
  const eventsRef = useRef<EventSource | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Set while the widget hangs up on Voice Gateway itself, to switch over to the agent.
  const switchingRef = useRef(false)
  const inCall = phase.name === "connecting" || phase.name === "live"

  // Hang up if the page goes away mid-call.
  useEffect(() => {
    const leave = () => {
      reportEnded(callTokenRef)
      void clientRef.current?.destroy().catch(() => undefined)
      closeDirect(direct)
      eventsRef.current?.close()
    }
    window.addEventListener("beforeunload", leave)
    return () => {
      window.removeEventListener("beforeunload", leave)
      leave()
    }
  }, [])

  async function start(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!ENDPOINT_URL || !TENANT) {
      setError("Calls aren't set up on this page yet.")
      return
    }
    setPhase({ name: "starting" })
    try {
      // Asks for the microphone first, while the click still counts as the user's gesture.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      mic.getTracks().forEach((track) => track.stop())

      const response = await fetch(`${API_URL}/widget/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: TENANT, name, email }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? "We couldn't start the call.")
      }
      const { callToken, ticketNumber } = (await response.json()) as WidgetCallResponse
      callTokenRef.current = callToken
      setPhase({ name: "connecting", ticketNumber })
      listen(callToken, ticketNumber)

      const { createWebRTCClient, checkWebRTCSupport } = await import("@cognigy/click-to-call-sdk")
      const support = checkWebRTCSupport()
      if (!support.supported)
        throw new Error("This browser can't make calls. Try a current Chrome, Edge, Firefox, or Safari.")

      const client = await createWebRTCClient({ endpointUrl: ENDPOINT_URL, userId: callToken })
      clientRef.current = client
      client.on("answered", () => setPhase({ name: "live", ticketNumber, since: Date.now() }))
      client.on("ended", (_session, info) => {
        // Hanging up on Voice Gateway to talk with the agent directly isn't the end of the call.
        if (switchingRef.current) return
        finish(ticketNumber, info.originator === "local" ? null : "The call ended.")
      })
      client.on("failed", (_session, info) =>
        finish(ticketNumber, info.cause ? `The call couldn't connect (${info.cause}).` : "The call couldn't connect."),
      )
      client.on("muted", () => setMuted(true))
      client.on("unmuted", () => setMuted(false))
      client.on("transcription", (data: TranscriptionEvent) => {
        if (process.env.NODE_ENV !== "production") console.debug("[call] transcription", data)
        const text = transcriptionText(data)
        if (!text) return
        const who = transcriptionSpeaker(data)
        setCaptions((current) => [...current.slice(-5), { id: ++captionId.current, who, text }])
      })
      client.on("error", (err) => setError(err.message))
      await client.connectAndCall()
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Allow the microphone to call us."
          : err instanceof Error
            ? err.message
            : "We couldn't start the call."
      setError(message)
      reportEnded(callTokenRef)
      setPhase({ name: "form" })
      void clientRef.current?.destroy().catch(() => undefined)
      clientRef.current = null
    }
  }

  /**
   * The call's events from oneix. After a handover, the agent who answers sends an offer; the widget
   * answers it, and once the direct call is up, hangs up on Voice Gateway.
   */
  function listen(callToken: string, ticketNumber: number) {
    eventsRef.current?.close()
    const events = new EventSource(`${API_URL}/widget/calls/${encodeURIComponent(callToken)}/events`)
    eventsRef.current = events
    let iceServers: IceServer[] = []
    const send = (signal: CallSignal) =>
      fetch(`${API_URL}/widget/calls/${encodeURIComponent(callToken)}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      }).catch(() => undefined)

    events.onmessage = (message) => {
      let event: WidgetCallEvent
      try {
        event = JSON.parse(message.data as string) as WidgetCallEvent
      } catch {
        return
      }
      if (event.type === "agent.answered") {
        iceServers = event.iceServers
        setAgentName(event.agentName)
      } else if (event.type === "signal") {
        void onSignal(event.signal)
      } else if (event.type === "call.ended") {
        finish(ticketNumber, "The agent ended the call.")
      } else if (event.type === "call.missed") {
        finish(ticketNumber, event.message)
      }
    }

    async function onSignal(signal: CallSignal) {
      try {
        if (signal.type === "offer") {
          const call = await openDirect(iceServers, send, () => switchOver(ticketNumber))
          direct.current = call
          await call.connection.setRemoteDescription({ type: "offer", sdp: signal.sdp })
          for (const candidate of call.pending.splice(0)) await call.connection.addIceCandidate(candidate)
          const answer = await call.connection.createAnswer()
          await call.connection.setLocalDescription(answer)
          await send({ type: "answer", sdp: answer.sdp ?? "" })
        } else if (signal.type === "candidate" && signal.candidate) {
          const call = direct.current
          if (call?.connection.remoteDescription) await call.connection.addIceCandidate(signal.candidate)
          else if (call) call.pending.push(signal.candidate)
        }
      } catch (err) {
        console.warn("[call] couldn't connect to the agent", err)
        setError("We couldn't connect you to our colleague.")
      }
    }
  }

  /** The direct call with the agent is up: play the agent, and hang up on Voice Gateway. */
  function switchOver(ticketNumber: number) {
    const call = direct.current
    const audio = audioRef.current
    if (call && audio) {
      audio.srcObject = call.remote
      void audio.play().catch(() => undefined)
    }
    switchingRef.current = true
    const client = clientRef.current
    clientRef.current = null
    if (client) {
      void client
        .endCall()
        .catch(() => undefined)
        .finally(() => void client.destroy().catch(() => undefined))
    }
    setCaptions([])
    setMuted(false)
    setPhase({ name: "live", ticketNumber, since: Date.now() })
  }

  function finish(ticketNumber: number | null, reason: string | null) {
    reportEnded(callTokenRef)
    void clientRef.current?.destroy().catch(() => undefined)
    clientRef.current = null
    closeDirect(direct)
    eventsRef.current?.close()
    eventsRef.current = null
    switchingRef.current = false
    setMuted(false)
    setPhase({ name: "ended", ticketNumber, reason })
  }

  function hangUp() {
    const ticketNumber = phase.name === "connecting" || phase.name === "live" ? phase.ticketNumber : null
    void clientRef.current?.endCall().catch(() => undefined)
    finish(ticketNumber, null)
  }

  function toggleMute() {
    const track = direct.current?.mic.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setMuted(!track.enabled)
      return
    }
    const client = clientRef.current
    if (!client) return
    void (muted ? client.unmute() : client.mute())
  }

  function reset() {
    setCaptions([])
    setAgentName(null)
    setError(null)
    setPhase({ name: "form" })
  }

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="fixed right-5 bottom-5 z-50 flex items-center gap-2.5 rounded-full bg-brand py-3 pr-5 pl-4 font-medium text-brand-foreground shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:outline-none"
      >
        <span className="relative flex size-7 items-center justify-center rounded-full bg-white/15">
          <Phone className="size-4" />
        </span>
        Talk to us
      </button>
    )
  }

  return (
    <section
      aria-label="Call us"
      className="fixed right-4 bottom-4 left-4 z-50 flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/15 sm:left-auto sm:w-[380px]"
    >
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Phone className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">Acme Support</p>
          <p className="text-xs text-muted-foreground">
            {inCall ? "On a call" : "Our assistant answers right away, 24/7"}
          </p>
        </div>
        {!inCall && (
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {(phase.name === "form" || phase.name === "starting") && (
          <form onSubmit={start} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Call us from your browser. Tell us who you are so we can find your account, and our assistant will pick
              up. If you need a person, it connects you, with everything you&apos;ve said.
            </p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Name
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </label>
            <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--brand)]"
              />
              I understand this call is answered by an AI assistant and is transcribed to help our team support me.
            </label>
            {error && <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={phase.name === "starting"}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-medium text-brand-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {phase.name === "starting" ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
              {phase.name === "starting" ? "Getting things ready…" : "Start call"}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Free, from your browser. Uses your microphone.
            </p>
          </form>
        )}

        {inCall && (
          <LiveCall
            connecting={phase.name === "connecting"}
            since={phase.name === "live" ? phase.since : null}
            ticketNumber={phase.ticketNumber}
            captions={captions}
            agentName={phase.name === "live" ? agentName : null}
            error={error}
          />
        )}

        {phase.name === "ended" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
              <PhoneOff className="size-5" />
            </span>
            <p className="font-display text-xl">Thanks for calling</p>
            <p className="text-sm text-muted-foreground">{phase.reason ?? "Your call has ended."}</p>
            {phase.ticketNumber && (
              <p className="text-sm">
                Your reference is <span className="font-semibold tabular-nums">#{phase.ticketNumber}</span>. We&apos;ll
                email you about it.
              </p>
            )}
            <button
              onClick={reset}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              Call again <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {/* The agent's voice, after a handover. */}
        <audio ref={audioRef} autoPlay className="hidden" />
      </div>

      {inCall && (
        <footer className="flex items-center justify-center gap-4 border-t border-border px-5 py-4">
          <button
            onClick={toggleMute}
            disabled={phase.name !== "live"}
            aria-label={muted ? "Unmute" : "Mute"}
            className={`flex size-12 items-center justify-center rounded-full border transition disabled:opacity-40 ${
              muted ? "border-transparent bg-foreground text-background" : "border-border hover:bg-muted"
            }`}
          >
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <button
            onClick={hangUp}
            aria-label="End call"
            className="flex size-14 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition hover:opacity-90"
          >
            <PhoneOff className="size-6" />
          </button>
        </footer>
      )}
    </section>
  )
}

function LiveCall({
  connecting,
  since,
  ticketNumber,
  captions,
  agentName,
  error,
}: {
  connecting: boolean
  since: number | null
  ticketNumber: number
  captions: Caption[]
  /** The agent the caller is talking with, after a handover. */
  agentName: string | null
  error: string | null
}) {
  const elapsed = useElapsed(since)
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative mt-2 flex size-28 items-center justify-center">
        {!connecting && <span className="animate-breathe absolute inset-0 rounded-full bg-brand" aria-hidden />}
        <span
          className={`relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-brand-foreground shadow-lg ${
            connecting ? "opacity-70" : ""
          }`}
        >
          {connecting ? <Loader2 className="size-7 animate-spin" /> : <Phone className="size-7" />}
        </span>
      </div>
      <div className="text-center">
        <p className="font-display text-xl">
          {connecting
            ? "Connecting…"
            : agentName
              ? `You're talking with ${agentName}`
              : "You're talking with our assistant"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {connecting ? "This takes a few seconds" : elapsed} · Ref #{ticketNumber}
        </p>
      </div>
      {captions.length > 0 && (
        <ol aria-live="polite" className="flex w-full flex-col gap-2 rounded-2xl bg-muted p-3 text-sm">
          {captions.map((caption) => (
            <li key={caption.id} className={caption.who === "You" ? "text-right" : ""}>
              <span className="block text-[11px] font-medium text-muted-foreground">{caption.who}</span>
              {caption.text}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  )
}

function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  if (!since) return ""
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/** The direct call with the agent after a handover: the connection, the caller's mic, the agent's voice. */
interface DirectCall {
  connection: RTCPeerConnection
  mic: MediaStream
  remote: MediaStream
  /** The agent's candidates that arrived before their offer was applied. */
  pending: RTCIceCandidateInit[]
}

/** Opens the caller's side of the direct call; `onConnected` runs once audio can flow. */
async function openDirect(
  iceServers: IceServer[],
  send: (signal: CallSignal) => Promise<unknown>,
  onConnected: () => void,
): Promise<DirectCall> {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  const connection = new RTCPeerConnection({ iceServers })
  const remote = new MediaStream()
  for (const track of mic.getTracks()) connection.addTrack(track, mic)
  connection.addEventListener("track", (event) => remote.addTrack(event.track))
  connection.addEventListener("icecandidate", (event) => {
    const c = event.candidate
    void send({
      type: "candidate",
      candidate: c
        ? {
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex,
            usernameFragment: c.usernameFragment,
          }
        : null,
    })
  })
  let connected = false
  connection.addEventListener("connectionstatechange", () => {
    if (process.env.NODE_ENV !== "production") console.debug("[call] direct connection", connection.connectionState)
    if (connection.connectionState === "connected" && !connected) {
      connected = true
      onConnected()
    }
  })
  return { connection, mic, remote, pending: [] }
}

function closeDirect(direct: { current: DirectCall | null }) {
  direct.current?.connection.close()
  direct.current?.mic.getTracks().forEach((track) => track.stop())
  direct.current = null
}

/**
 * Tells oneix the customer's call is over, so agents don't see it live any more. A beacon still goes
 * out while the page closes.
 */
function reportEnded(tokenRef: { current: string | null }) {
  const token = tokenRef.current
  if (!token) return
  tokenRef.current = null
  const url = `${API_URL}/widget/calls/${encodeURIComponent(token)}/end`
  if (navigator.sendBeacon?.(url)) return
  void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined)
}

/** Voice Gateway's live transcription, passed on as is by the Click To Call SDK; its shape varies. */
type TranscriptionEvent = Record<string, unknown> & { messages?: Record<string, unknown>[] }

const CALLER_ROLES = ["user", "customer", "caller", "human", "input", "local", "inbound"]

function transcriptionText(data: TranscriptionEvent): string {
  const parts = data.messages?.length ? data.messages : [data]
  return parts
    .map((m) => [m.text, m.transcript, m.message].find((v): v is string => typeof v === "string") ?? "")
    .join(" ")
    .trim()
}

/** The caller's own words, or the assistant's, from whichever field the event names the speaker in. */
function transcriptionSpeaker(data: TranscriptionEvent): Caption["who"] {
  const first = data.messages?.[0] ?? {}
  for (const record of [data, first]) {
    for (const key of ["role", "source", "speaker", "type", "originator", "direction", "from"]) {
      const value = record[key]
      if (typeof value === "string" && CALLER_ROLES.includes(value.toLowerCase())) return "You"
    }
  }
  return "Assistant"
}
