"use client"

import { type SoftphoneCredentials, VOICE_SIP_HEADERS } from "@oneix/contracts"
import type { RTCSession } from "jssip/lib/RTCSession"
import type { RTCSessionEvent, UA } from "jssip/lib/UA"
import { useRouter } from "next/navigation"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ApiError } from "@/lib/api"
import { useAnswerCall, useEndCall } from "./queries"

export type SoftphoneStatus = "off" | "connecting" | "registered" | "failed"

export interface IncomingCall {
  callId: string | null
  ticketNumber: number | null
  /** How Voice Gateway identifies the caller, until the live call is known. */
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

/**
 * The agent's phone in the browser. While the agent is available it registers with Voice Gateway
 * (JsSIP over WebSocket), so a handover from the AI agent rings here. Answering opens the call's
 * ticket.
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
  const answerCall = useAnswerCall()
  const endCall = useEndCall()
  // What JsSIP last reported, for the credentials it was running with.
  const [reported, setReported] = useState<{ key: string; status: SoftphoneStatus; error: string | null } | null>(null)
  const phoneKey = enabled && credentials ? `${credentials.sipUser}:${credentials.password}` : null
  const current = phoneKey !== null && reported?.key === phoneKey ? reported : null
  const status: SoftphoneStatus = phoneKey === null ? "off" : (current?.status ?? "connecting")
  const error = current?.error ?? null
  const [incoming, setIncoming] = useState<IncomingCall | null>(null)
  const [active, setActive] = useState<ActiveCall | null>(null)
  const sessionRef = useRef<RTCSession | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Handlers registered with JsSIP read the latest state through refs.
  const busyRef = useRef(false)
  const activeRef = useRef<ActiveCall | null>(null)
  useEffect(() => {
    busyRef.current = incoming !== null || active !== null
    activeRef.current = active
  }, [incoming, active])

  const clearCall = useCallback(() => {
    sessionRef.current = null
    setIncoming(null)
    setActive(null)
    if (audioRef.current) audioRef.current.srcObject = null
  }, [])

  const reportEnded = endCall.mutate
  useEffect(() => {
    if (!enabled || !credentials) return
    const key = `${credentials.sipUser}:${credentials.password}`
    const report = (status: SoftphoneStatus, error: string | null = null) => setReported({ key, status, error })

    let ua: UA | null = null
    let stopped = false

    void import("jssip").then((JsSIP) => {
      if (stopped) return
      ua = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(credentials.wsUri)],
        uri: `sip:${credentials.sipUser}@${credentials.realm}`,
        authorization_user: credentials.sipUser,
        password: credentials.password,
        register: true,
        session_timers: false,
        user_agent: "oneix-softphone",
      })
      ua.on("registered", () => report("registered"))
      ua.on("registrationFailed", (event) =>
        report("failed", `Couldn't connect your phone: ${event.cause ?? "registration failed"}`),
      )
      ua.on("disconnected", () => report("connecting"))
      ua.on("newRTCSession", (event: RTCSessionEvent) => {
        if (event.originator !== "remote") return
        const session = event.session
        if (busyRef.current) {
          session.terminate({ status_code: 486, reason_phrase: "Busy Here" })
          return
        }
        const callId = event.request.getHeader(VOICE_SIP_HEADERS.call) || null
        const ticketNumber = Number(event.request.getHeader(VOICE_SIP_HEADERS.ticket)) || null
        const caller = session.remote_identity.display_name || session.remote_identity.uri.user || "Caller"
        sessionRef.current = session

        session.on("peerconnection", ({ peerconnection }: { peerconnection: RTCPeerConnection }) => {
          peerconnection.addEventListener("track", (track: RTCTrackEvent) => {
            const audio = audioRef.current
            if (audio && track.streams[0]) {
              audio.srcObject = track.streams[0]
              void audio.play().catch(() => undefined)
            }
          })
        })
        // Ends while ringing (another agent answered, or the caller hung up) or after the call.
        const finished = () => {
          if (sessionRef.current !== session) return
          const callId = activeRef.current?.callId
          if (callId) reportEnded(callId)
          clearCall()
        }
        session.on("failed", finished)
        session.on("ended", finished)
        setIncoming({ callId, ticketNumber, caller })
      })
      ua.start()
    })

    return () => {
      stopped = true
      sessionRef.current?.terminate()
      ua?.stop()
      clearCall()
    }
  }, [enabled, credentials, clearCall, reportEnded])

  const accept = useCallback(() => {
    const session = sessionRef.current
    if (!session || !incoming) return
    session.answer({ mediaConstraints: { audio: true, video: false } })
    setActive({ ...incoming, answeredAt: Date.now(), muted: false })
    setIncoming(null)
    if (incoming.ticketNumber) router.push(`/tickets/${incoming.ticketNumber}`)
    if (incoming.callId) {
      answerCall.mutate(incoming.callId, {
        onError: (error) => {
          // Someone else got there first: let the call go.
          if (error instanceof ApiError && error.status === 409) {
            toast.error(error.message)
            session.terminate()
          }
        },
      })
    }
  }, [incoming, answerCall, router])

  const decline = useCallback(() => {
    sessionRef.current?.terminate({ status_code: 486, reason_phrase: "Busy Here" })
    clearCall()
  }, [clearCall])

  const hangUp = useCallback(() => sessionRef.current?.terminate(), [])

  const toggleMute = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    const muted = session.isMuted().audio ?? false
    if (muted) session.unmute({ audio: true })
    else session.mute({ audio: true })
    setActive((current) => (current ? { ...current, muted: !muted } : current))
  }, [])

  const value = useMemo<Softphone>(
    () => ({ status, error, incoming, active, accept, decline, hangUp, toggleMute }),
    [status, error, incoming, active, accept, decline, hangUp, toggleMute],
  )

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {/* The caller's voice. */}
      <audio ref={audioRef} autoPlay className="hidden" />
    </SoftphoneContext.Provider>
  )
}
