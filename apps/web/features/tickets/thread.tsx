"use client"

import type { ThreadEntry } from "@oneix/contracts"
import { Lock } from "lucide-react"
import { useEffect, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { dateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?"
}

/** Messages from the same author this close together read as one run, with one header. */
const RUN_GAP_MS = 5 * 60_000

const dayFormat = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" })

/**
 * The ticket's conversation as chat bubbles: your own messages on the right, everyone else's on the
 * left (customers in white, other agents in blue), internal notes in amber, system messages centred. Scrolls on its own and opens at the newest
 * message, like a chat.
 */
export function Thread({ entries, className }: { entries: ThreadEntry[]; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const last = entries.at(-1)?.id

  // Opens at the newest message, and follows when one is added.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [last])

  return (
    <div ref={scroller} className={cn("overflow-y-auto", className)}>
      {entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <ol className="flex flex-col px-6 py-6">
          {entries.map((entry, i) => {
            const previous = entries[i - 1]
            const newDay = !previous || dayKey(previous.createdAt) !== dayKey(entry.createdAt)
            const continues =
              !newDay &&
              previous !== undefined &&
              previous.author.name === entry.author.name &&
              previous.author.type === entry.author.type &&
              previous.kind === entry.kind &&
              new Date(entry.createdAt).getTime() - new Date(previous.createdAt).getTime() < RUN_GAP_MS
            return (
              <li key={entry.id} className={cn(continues ? "mt-1" : "mt-5", i === 0 && "mt-0")}>
                {newDay && <DaySeparator iso={entry.createdAt} />}
                {entry.author.type === "system" ? (
                  <SystemMessage entry={entry} />
                ) : (
                  <Bubble entry={entry} continues={continues} />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function Bubble({ entry, continues }: { entry: ThreadEntry; continues: boolean }) {
  const customer = entry.author.type === "customer"
  const note = entry.kind === "internal_note"
  // Your own messages sit on the right, everyone else's (customers and other agents) on the left.
  const mine = entry.author.isYou

  return (
    <div className={cn("flex items-end gap-2.5", mine && "flex-row-reverse")}>
      {/* The avatar marks the start of each run. */}
      <div className="w-8 shrink-0 self-start">
        {!continues && (
          <Avatar className="size-8">
            <AvatarFallback
              className={cn(
                "text-xs",
                customer
                  ? "bg-muted text-muted-foreground"
                  : note
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                    : "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
              )}
            >
              {initials(entry.author.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className={cn("flex max-w-[min(42rem,78%)] min-w-0 flex-col gap-1", mine && "items-end")}>
        {!continues && (
          <div className={cn("flex items-center gap-2 px-1 text-xs", mine && "flex-row-reverse")}>
            <span className="font-medium text-foreground">{mine ? "You" : entry.author.name}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] font-medium",
                customer
                  ? "bg-muted text-muted-foreground"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
              )}
            >
              {customer ? "Customer" : "Agent"}
            </span>
            {note && (
              <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                <Lock className="size-3" />
                Internal note
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap ring-1",
            // The corner nearest the avatar is tighter, like a speech tail; only on a run's first bubble.
            !continues && (mine ? "rounded-tr-md" : "rounded-tl-md"),
            customer && "bg-card ring-border",
            !customer && !note && "bg-blue-50 ring-blue-100 dark:bg-blue-500/10 dark:ring-blue-500/20",
            note && "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25",
          )}
        >
          {entry.body}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={entry.createdAt} className="px-1 text-[11px] text-muted-foreground">
              {timeFormat.format(new Date(entry.createdAt))}
            </time>
          </TooltipTrigger>
          <TooltipContent>{dateTime(entry.createdAt)}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function SystemMessage({ entry }: { entry: ThreadEntry }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-1 text-center">
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">{entry.body}</p>
      <time dateTime={entry.createdAt} className="text-[11px] text-muted-foreground">
        {entry.author.name} · {timeFormat.format(new Date(entry.createdAt))}
      </time>
    </div>
  )
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 text-[11px] font-medium text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {dayLabel(iso)}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return dayFormat.format(date)
}
