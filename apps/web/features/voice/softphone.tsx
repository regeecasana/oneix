"use client"

import type {
  CallSignal,
  IceServer,
  SoftphoneCredentials,
} from "@oneix/contracts"
import { useRouter } from "next/navigation"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { API_URL, ApiError, api } from "@/lib/api"
import { useAnswerCall, useEndCall, useLiveCalls, VOICE_EVENT } from "./queries"

export type SoftphoneStatus = "off" | "connecting" | "registered" | "failed"

export interface IncomingCall {
  callId: string | null
  ticketNumber: number | null
  /** Who is calling, for the pop-up. */
  caller: string
}

export interface ActiveCall extends IncomingCall {
  answeredAt: number
  muted: boolean
}

interface Softphone {
  status: SoftphoneStatus
  error: string | null
  incoming: IncomingCall | null
  active: ActiveCall | null
  accept: () => void
  decline: () => void
  hangUp: () => void
  toggleMute: () => void
}

const SoftphoneContext = createContext<Softphone | null>(null)

export function useSoftphone(): Softphone {
  const softphone = useContext(SoftphoneContext)
  if (!softphone) throw new Error("useSoftphone needs a SoftphoneProvider")
  return softphone
}

/** Without configured servers, Google's STUN helps the two browsers find a way to each other. */
const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
]

/**
 * The agent's phone in the browser. When the AI agent hands a website call over, available agents
 * get the pop-up; the first to answer talks with the customer directly, browser to browser. oneix
 * relays the setup (offer, answer, network candidates); the audio doesn't go through Cognigy or
 * Voice Gateway. Answering opens the call's ticket.
 */
export function SoftphoneProvider({
  credentials,
  enabled,
  children,
}: {
  credentials: SoftphoneCredentials | null
  enabled: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const calls = useLiveCalls()
  const answerCall = useAnswerCall()
  const endCall = useEndCall()
  // The call this agent answered. It's over once it leaves the live calls (the customer hung up) or
  // stops being the agent's (missed); "queued" covers the moment before the list catches up.
  const [answered, setActive] = useState<ActiveCall | null>(null)
  const answeredCall = answered
    ? calls.data?.items.find((c) => c.id === answered.callId)
    : undefined
  const stillOn =
    answered !== null &&
    (!calls.data ||
      (answeredCall !== undefined &&
        ["queued", "agent"].includes(answeredCall.state)))
  const active = stillOn ? answered : null
  // Calls this agent declined: they keep ringing for others, not here.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(() => new Set())
  const connectionRef = useRef<RTCPeerConnection | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // The customer's candidates that arrive before their answer, applied once it's set.
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const iceServers = credentials?.iceServers?.length
    ? credentials.iceServers
    : DEFAULT_ICE_SERVERS

  const status: SoftphoneStatus = enabled ? "registered" : "off"

  // A call waiting for an agent rings here while this agent is available and free.
  const waiting =
    enabled && !active
      ? calls.data?.items.find(
          (c) => c.state === "queued" && !declined.has(c.id)
        )
      : undefined
  const incoming = useMemo<IncomingCall | null>(
    () =>
      waiting
        ? {
            callId: waiting.id,
            ticketNumber: waiting.ticketNumber,
            caller: waiting.customerName,
          }
        : null,
    [waiting]
  )

  /** Stops the audio, without telling oneix. */
  const releaseMedia = useCallback(() => {
    connectionRef.current?.close()
    connectionRef.current = null
    micRef.current?.getTracks().forEach((track) => track.stop())
    micRef.current = null
    pendingCandidates.current = []
    if (audioRef.current) audioRef.current.srcObject = null
  }, [])

  // The call ended elsewhere (the customer hung up, or it was missed): stop the audio.
  const activeCallId = active?.callId ?? null
  useEffect(() => {
    if (answered && !stillOn) releaseMedia()
  }, [answered, stillOn, releaseMedia])

  // The customer's side of setting up the call, relayed by oneix.
  useEffect(() => {
    if (!activeCallId) return
    async function applySignal(signal: CallSignal) {
      const connection = connectionRef.current
      if (!connection) return
      try {
        if (signal.type === "answer") {
          await connection.setRemoteDescription({
            type: "answer",
            sdp: signal.sdp,
          })
          for (const candidate of pendingCandidates.current.splice(0))
            await connection.addIceCandidate(candidate)
        } else if (signal.type === "candidate" && signal.candidate) {
          if (connection.remoteDescription)
            await connection.addIceCandidate(signal.candidate)
          else pendingCandidates.current.push(signal.candidate)
        }
      } catch (error) {
        console.warn("[softphone] couldn't apply the customer's signal", error)
      }
    }
    const onEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          type: string
          callId?: string
          signal?: CallSignal
        }>
      ).detail
      if (
        detail.type === "call.signal" &&
        detail.callId === activeCallId &&
        detail.signal
      )
        void applySignal(detail.signal)
    }
    window.addEventListener(VOICE_EVENT, onEvent)
    return () => window.removeEventListener(VOICE_EVENT, onEvent)
  }, [activeCallId])

  // Hang up if the tab closes mid-call, so the customer isn't left waiting.
  useEffect(() => {
    if (!activeCallId) return
    const leave = () => {
      void fetch(`${API_URL}/voice/calls/${activeCallId}/end`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", leave)
    return () => window.removeEventListener("pagehide", leave)
  }, [activeCallId])

  const accept = useCallback(() => {
    if (!incoming?.callId) return
    const call = incoming
    const callId = incoming.callId
    void (async () => {
      let mic: MediaStream
      try {
        // The microphone first: without it there's no call to take.
        mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        toast.error("Allow the microphone to answer calls.")
        return
      }
      try {
        await answerCall.mutateAsync(callId)
      } catch (error) {
        mic.getTracks().forEach((track) => track.stop())
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Couldn't answer the call."
        )
        setDeclined((current) => new Set(current).add(callId))
        return
      }

      micRef.current = mic
      setActive({ ...call, answeredAt: Date.now(), muted: false })
      if (call.ticketNumber) router.push(`/tickets/${call.ticketNumber}`)

      const connection = new RTCPeerConnection({ iceServers })
      connectionRef.current = connection
      for (const track of mic.getTracks()) connection.addTrack(track, mic)
      const signal = (body: CallSignal) =>
        api<void>(`/voice/calls/${callId}/signal`, {
          method: "POST",
          body,
        }).catch((error: unknown) =>
          console.warn("[softphone] couldn't send a signal", error)
        )
      connection.addEventListener("icecandidate", (event) => {
        const c = event.candidate
        void signal({
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
      connection.addEventListener("track", (event) => {
        const audio = audioRef.current
        if (!audio || event.track.kind !== "audio") return
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
        void audio.play().catch(() => undefined)
      })
      watchConnection(connection, audioRef)

      // The customer's widget is waiting for this offer to switch the call over.
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await signal({ type: "offer", sdp: offer.sdp ?? "" })
    })()
  }, [incoming, answerCall, router, iceServers])

  const decline = useCallback(() => {
    const callId = incoming?.callId
    if (callId) setDeclined((current) => new Set(current).add(callId))
  }, [incoming])

  const reportEnded = endCall.mutate
  const hangUp = useCallback(() => {
    if (activeCallId) reportEnded(activeCallId)
    releaseMedia()
    setActive(null)
  }, [activeCallId, reportEnded, releaseMedia])

  const toggleMute = useCallback(() => {
    const track = micRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setActive((current) =>
      current ? { ...current, muted: !track.enabled } : current
    )
  }, [])

  const value = useMemo<Softphone>(
    () => ({
      status,
      error: null,
      incoming,
      active,
      accept,
      decline,
      hangUp,
      toggleMute,
    }),
    [status, incoming, active, accept, decline, hangUp, toggleMute]
  )

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {/* The customer's voice. */}
      <audio ref={audioRef} autoPlay className="hidden" />
    </SoftphoneContext.Provider>
  )
}

/** Reports a connection that can't carry audio, and in development logs how the audio flows. */
function watchConnection(
  connection: RTCPeerConnection,
  audioRef: { current: HTMLAudioElement | null }
) {
  const dev = process.env.NODE_ENV !== "production"
  const timer = dev
    ? setInterval(() => void logAudioStats(connection, audioRef.current), 3000)
    : undefined
  connection.addEventListener("connectionstatechange", () => {
    if (dev) console.debug("[softphone] connection", connection.connectionState)
    if (connection.connectionState === "failed") {
      toast.error(
        "The call's audio couldn't connect. Your network may block it; ask an admin to set up a TURN server."
      )
    }
    if (
      connection.connectionState === "closed" ||
      connection.connectionState === "failed"
    )
      clearInterval(timer)
  })
}

/** Logs the call's audio flow, to tell a silent call's cause: nothing arriving, playback, or the mic. */
async function logAudioStats(
  connection: RTCPeerConnection,
  audio: HTMLAudioElement | null
): Promise<void> {
  if (connection.connectionState === "closed") return
  const stats = await connection.getStats()
  const report: Record<string, unknown> = {
    connection: connection.connectionState,
  }
  stats.forEach((stat: RTCStats & Record<string, unknown>) => {
    if (stat.type === "inbound-rtp" && stat.kind === "audio")
      report.in = { packets: stat.packetsReceived, level: stat.audioLevel }
    if (stat.type === "outbound-rtp" && stat.kind === "audio")
      report.out = { packets: stat.packetsSent }
  })
  const mic = connection
    .getSenders()
    .find((s) => s.track?.kind === "audio")?.track
  report.micTrack = mic
    ? { enabled: mic.enabled, state: mic.readyState }
    : "none"
  report.player = audio
    ? { hasStream: audio.srcObject !== null, paused: audio.paused }
    : "none"
  console.debug("[softphone] audio", report)
}
