"use client"

import type { LiveCall, PresenceResponse, PresenceStatus, ThreadEntry } from "@oneix/contracts"
import { Bot, Headset, Mic, MicOff, Phone, PhoneIncoming, PhoneOff } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useCallTranscript, useLiveCalls, useSetPresence } from "./queries"
import { useSoftphone } from "./softphone"

const stateLabels: Record<LiveCall["state"], string> = {
  connecting: "Connecting",
  ai: "With the AI agent",
  queued: "Waiting for an agent",
  agent: "With an agent",
  missed: "Missed",
  ended: "Ended",
}

/** Seconds since a moment, ticking every second. */
export function useElapsed(since: string | number | null | undefined): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  if (!since) return ""
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** Available or Away, with the softphone's state. Available agents are rung on handovers. */
export function PresenceControl({ presence }: { presence: PresenceResponse | undefined }) {
  const setPresence = useSetPresence()
  const softphone = useSoftphone()
  const status = presence?.status ?? "away"
  const problem =
    status === "available" ? (presence?.softphoneUnavailable ?? softphone.error) : null
  const connecting = status === "available" && !problem && softphone.status !== "registered"

  async function change(next: PresenceStatus) {
    // Ask for the microphone now, not when a call is already ringing.
    if (next === "available") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      } catch {
        // The softphone reports it again when a call comes in.
      }
    }
    setPresence.mutate(next)
  }

  const trigger = (
    <SelectTrigger size="sm" aria-label="Availability for calls" className="min-w-36">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          status === "away" && "bg-muted-foreground/50",
          status === "available" && (problem ? "bg-amber-500" : connecting ? "animate-pulse bg-emerald-400" : "bg-emerald-500"),
        )}
        aria-hidden
      />
      <SelectValue />
    </SelectTrigger>
  )

  return (
    <Select value={status} onValueChange={(value) => void change(value as PresenceStatus)} disabled={setPresence.isPending}>
      {problem || connecting ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent className="max-w-64">{problem ?? "Connecting your phone…"}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <SelectContent align="end">
        <SelectItem value="available">Available for calls</SelectItem>
        <SelectItem value="away">Away</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** The ringing pop-up when the AI agent hands a call over. */
export function IncomingCallDialog() {
  const softphone = useSoftphone()
  const calls = useLiveCalls()
  const incoming = softphone.incoming
  const call = calls.data?.items.find((c) => c.id === incoming?.callId)
  useRingtone(incoming !== null)

  return (
    <Dialog open={incoming !== null} onOpenChange={(open) => !open && softphone.decline()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <PhoneIncoming className="size-6 animate-pulse" />
          </div>
          <DialogTitle>Incoming call{call ? ` from ${call.customerName}` : ""}</DialogTitle>
          <DialogDescription>
            The AI agent is handing this call over. Its conversation with the customer is on the ticket, so you can pick
            up where it left off.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="truncate font-medium">{call?.customerName ?? incoming?.caller}</dd>
          {call?.customerEmail && (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{call.customerEmail}</dd>
            </>
          )}
          {incoming?.ticketNumber && (
            <>
              <dt className="text-muted-foreground">Ticket</dt>
              <dd className="tabular-nums">#{incoming.ticketNumber}</dd>
            </>
          )}
        </dl>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={softphone.decline}>
            <PhoneOff data-icon="inline-start" />
            Decline
          </Button>
          <Button onClick={softphone.accept} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Phone data-icon="inline-start" />
            Answer and open ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The call the agent is on, in the top bar: who, how long, mute, hang up. */
export function ActiveCallBar() {
  const softphone = useSoftphone()
  const calls = useLiveCalls()
  const active = softphone.active
  const elapsed = useElapsed(active?.answeredAt)
  if (!active) return null
  const call = calls.data?.items.find((c) => c.id === active.callId)

  return (
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 py-1 pr-1 pl-3 text-sm text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30">
      <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
      <span className="max-w-40 truncate font-medium">{call?.customerName ?? active.caller}</span>
      {active.ticketNumber && (
        <Link href={`/tickets/${active.ticketNumber}`} className="tabular-nums hover:underline">
          #{active.ticketNumber}
        </Link>
      )}
      <span className="tabular-nums text-emerald-700 dark:text-emerald-300">{elapsed}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={softphone.toggleMute}
        aria-label={active.muted ? "Unmute" : "Mute"}
        className="rounded-full"
      >
        {active.muted ? <MicOff /> : <Mic />}
      </Button>
      <Button size="icon-sm" onClick={softphone.hangUp} aria-label="Hang up" className="rounded-full bg-red-600 text-white hover:bg-red-700">
        <PhoneOff />
      </Button>
    </div>
  )
}

/** Live calls in the sidebar: who is calling, where the call is, for how long. */
export function LiveCallsList({ compact = false }: { compact?: boolean }) {
  const calls = useLiveCalls()
  const pathname = usePathname()
  const items = calls.data?.items ?? []

  if (calls.isPending) return <p className="p-4 text-sm text-muted-foreground">Loading calls…</p>
  if (items.length === 0) {
    return compact ? null : (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Phone className="size-5" />
        No calls right now. Calls show here as soon as the AI agent answers.
      </div>
    )
  }
  return (
    <ul className="flex flex-col">
      {items.map((call) => (
        <li key={call.id}>
          <LiveCallItem call={call} active={pathname === `/tickets/${call.ticketNumber}`} />
        </li>
      ))}
    </ul>
  )
}

function LiveCallItem({ call, active }: { call: LiveCall; active: boolean }) {
  const elapsed = useElapsed(call.startedAt)
  return (
    <Link
      href={`/tickets/${call.ticketNumber}`}
      data-active={active}
      className="flex flex-col gap-1.5 border-b px-4 py-3 text-sm hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
    >
      <div className="flex items-center gap-2">
        <CallStateIcon state={call.state} />
        <span className="truncate font-medium">{call.customerName}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{elapsed}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">#{call.ticketNumber}</span>
        <span>·</span>
        <span className="truncate">
          {call.state === "agent" && call.agent ? `With ${call.agent.name}` : stateLabels[call.state]}
        </span>
      </div>
    </Link>
  )
}

function CallStateIcon({ state }: { state: LiveCall["state"] }) {
  const queued = state === "queued"
  const Icon = state === "ai" ? Bot : state === "agent" ? Headset : PhoneIncoming
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full",
        state === "ai" && "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
        queued && "animate-pulse bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        state === "agent" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

/** On a ticket whose call is live: a banner saying where the call is. */
export function LiveCallBanner({ ticketNumber }: { ticketNumber: number }) {
  const calls = useLiveCalls()
  const softphone = useSoftphone()
  const call = calls.data?.items.find((c) => c.ticketNumber === ticketNumber)
  const elapsed = useElapsed(call?.startedAt)
  if (!call) return null
  const onThisCall = softphone.active?.callId === call.id

  const text =
    call.state === "ai"
      ? `The AI agent is talking with ${call.customerName}.`
      : call.state === "queued"
        ? `The AI agent handed ${call.customerName} over and is waiting for an agent to answer.`
        : onThisCall
          ? `You're on the call with ${call.customerName}. The AI agent's conversation is in the thread below.`
          : `${call.agent?.name ?? "An agent"} is on the call with ${call.customerName}.`

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm",
        call.state === "ai" && "bg-violet-50 text-violet-950 dark:bg-violet-500/10 dark:text-violet-100",
        call.state === "queued" && "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100",
        call.state === "agent" && "bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100",
      )}
    >
      <CallStateIcon state={call.state} />
      <span className="font-medium">Call in progress</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <Badge variant="outline" className="shrink-0 tabular-nums">
        {elapsed}
      </Badge>
    </div>
  )
}

/**
 * While the AI agent has the call, its conversation as thread entries, live: one per line, after a
 * marker. From the handover on, the transcript note on the ticket holds it instead.
 */
export function useLiveTranscriptEntries(ticketNumber: number): ThreadEntry[] {
  const calls = useLiveCalls()
  const call = calls.data?.items.find((c) => c.ticketNumber === ticketNumber)
  const showing = call !== undefined && call.state === "ai"
  const transcript = useCallTranscript(showing ? call.id : undefined)
  if (!showing) return []
  const lines = transcript.data?.lines ?? []
  const since = call.startedAt ?? new Date().toISOString()
  return [
    {
      id: `live-${call.id}`,
      kind: "message",
      body: "Live call: the AI agent's conversation as it happens. It goes on the ticket as an internal note at handover.",
      author: { name: "oneix", type: "system", isYou: false },
      createdAt: since,
    },
    ...lines.map(
      (line, i): ThreadEntry => ({
        id: `live-${call.id}-${i}`,
        kind: "message",
        body: line.text,
        author:
          line.speaker === "customer"
            ? { name: call.customerName, type: "customer", isYou: false }
            : { name: "AI agent", type: "agent", isYou: false },
        createdAt: line.at ?? since,
      }),
    ),
  ]
}

/** Number of live calls, for the rail. */
export function useLiveCallCount(): number {
  return useLiveCalls().data?.items.length ?? 0
}


/** A soft two-tone ring while a call is offered. Browsers may block it until the page was clicked. */
function useRingtone(ringing: boolean) {
  useEffect(() => {
    if (!ringing) return
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
    } catch {
      return
    }
    const ctx = context
    const ring = () => {
      const gain = ctx.createGain()
      gain.gain.value = 0.06
      gain.connect(ctx.destination)
      for (const frequency of [440, 480]) {
        const tone = ctx.createOscillator()
        tone.frequency.value = frequency
        tone.connect(gain)
        tone.start()
        tone.stop(ctx.currentTime + 1.2)
      }
    }
    ring()
    const timer = setInterval(ring, 3000)
    return () => {
      clearInterval(timer)
      void ctx.close()
    }
  }, [ringing])
}
