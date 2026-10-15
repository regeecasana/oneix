"use client"

import type { TicketChannel, TicketSummary } from "@oneix/contracts"
import { ChevronDown, Inbox, Layers } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { SidebarContent, SidebarHeader, SidebarInput } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { channelIcons, channelLabels } from "./channels"
import { priorityLabels, StatusBadge } from "./labels"
import { LiveCallsList, useLiveCallCount } from "@/features/voice/voice-ui"
import { type TicketFilters, useChannelCounts, useTicketList } from "./queries"

const ALL = "all"
/** Channel tabs that fit next to "All" in the panel; the rest go under "More". */
const VISIBLE_CHANNEL_TABS = 2
const numberFormat = new Intl.NumberFormat("en")

/**
 * The ticket list beside an open ticket, in the sidebar: search, "assigned to me", channel tabs,
 * and the tickets, loading more as the list scrolls. Its filters live in the workspace layout, so
 * they stay as the agent moves from ticket to ticket.
 */
export function TicketListPanel() {
  const pathname = usePathname()
  const activeNumber = /^\/tickets\/(\d+)/.exec(pathname)?.[1]
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [mine, setMine] = useState(false)
  const [channel, setChannel] = useState<TicketChannel | typeof ALL>(ALL)

  // Searches once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const filters: TicketFilters = { q: q || undefined, assignee: mine ? "me" : undefined }
  const counts = useChannelCounts(filters)
  const list = useTicketList(filters, channel === ALL ? null : channel)
  const tickets = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.total

  // The busiest channels get tabs. A channel picked from "More" takes the last tab's place.
  const channels = counts.data?.channels ?? []
  let tabs = channels.slice(0, VISIBLE_CHANNEL_TABS)
  if (channel !== ALL && !tabs.some((c) => c.channel === channel)) {
    const picked = channels.find((c) => c.channel === channel)
    if (picked) tabs = [...tabs.slice(0, -1), picked]
  }
  const more = channels.filter((c) => !tabs.some((t) => t.channel === c.channel))

  return (
    <>
      <SidebarHeader className="gap-3 border-b p-4">
        <div className="flex w-full items-center justify-between gap-2">
          <Link href="/inbox" className="text-base font-medium text-foreground hover:underline">
            Inbox
          </Link>
          <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            Assigned to me
            <Switch checked={mine} onCheckedChange={setMine} className="shadow-none" />
          </Label>
        </div>
        <SidebarInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject, #number, customer"
          aria-label="Search tickets"
        />
        <div className="flex items-center gap-1">
          <Tabs value={channel} onValueChange={(value) => setChannel(value as typeof channel)} className="min-w-0">
            <TabsList aria-label="Channel" className="h-8">
              <TabsTrigger value={ALL} className="px-2 text-xs">
                <Layers data-icon="inline-start" />
                All
              </TabsTrigger>
              {tabs.map(({ channel: value, count }) => {
                const Icon = channelIcons[value]
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      <TabsTrigger value={value} className="px-2 text-xs tabular-nums" aria-label={channelLabels[value]}>
                        <Icon data-icon="inline-start" />
                        {compact(count)}
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      {channelLabels[value]}: {numberFormat.format(count)}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </TabsList>
          </Tabs>
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
                  More
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {more.map(({ channel: value, count }) => {
                  const Icon = channelIcons[value]
                  return (
                    <DropdownMenuItem key={value} onSelect={() => setChannel(value)}>
                      <Icon />
                      {channelLabels[value]}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {numberFormat.format(count)}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {total === undefined ? " " : `${numberFormat.format(total)} ${total === 1 ? "ticket" : "tickets"}`}
          {channel !== ALL && ` · ${channelLabels[channel]}`}
        </p>
      </SidebarHeader>

      <SidebarContent className={cn("gap-0", list.isPlaceholderData && "opacity-60")}>
        <LiveCallsSection />
        {list.isPending &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 border-b p-4">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        {list.isError && <p className="p-4 text-sm text-destructive">{list.error.message}</p>}
        {list.data && tickets.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Inbox className="size-5" />
            No tickets match.
          </div>
        )}
        {tickets.map((ticket) => (
          <TicketItem key={ticket.id} ticket={ticket} active={String(ticket.number) === activeNumber} />
        ))}
        <LoadMore
          hasMore={list.hasNextPage}
          loading={list.isFetchingNextPage}
          onVisible={() => void list.fetchNextPage()}
        />
      </SidebarContent>
    </>
  )
}

/** Live calls above the tickets, while there are any. */
function LiveCallsSection() {
  const count = useLiveCallCount()
  if (count === 0) return null
  return (
    <div className="border-b-4 border-sidebar-border">
      <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">Live calls · {count}</p>
      <LiveCallsList compact />
    </div>
  )
}

function TicketItem({ ticket, active }: { ticket: TicketSummary; active: boolean }) {
  const Icon = channelIcons[ticket.channel]
  const urgent = ticket.priority === "urgent" || ticket.priority === "high"
  return (
    <Link
      href={`/tickets/${ticket.number}`}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col gap-1.5 border-b px-4 py-3 text-sm leading-tight hover:bg-sidebar-accent",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:before:absolute data-[active=true]:before:inset-y-0 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:bg-primary",
      )}
    >
      <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-label={channelLabels[ticket.channel]} />
        <span className="truncate">{ticket.customer?.name ?? ticket.customer?.email ?? "Unknown customer"}</span>
        <span className="ml-auto shrink-0">{timeAgo(ticket.updatedAt)}</span>
      </div>
      <span className="line-clamp-2 font-medium text-foreground">
        <span className="mr-1 font-normal text-muted-foreground tabular-nums">#{ticket.number}</span>
        {ticket.subject}
      </span>
      <div className="flex items-center gap-1.5">
        <StatusBadge status={ticket.status} />
        {urgent && ticket.priority && (
          <Badge
            variant="outline"
            className={cn(ticket.priority === "urgent" && "border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-400")}
          >
            {priorityLabels[ticket.priority]}
          </Badge>
        )}
        <span className="ml-auto truncate text-xs text-muted-foreground">{ticket.assignee?.name ?? "Unassigned"}</span>
      </div>
    </Link>
  )
}

/** Loads the next page when the end of the list scrolls into view. */
function LoadMore({ hasMore, loading, onVisible }: { hasMore: boolean; loading: boolean; onVisible: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  })

  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasMore || loading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, loading])

  if (!hasMore && !loading) return null
  return (
    <div ref={sentinel} className="flex justify-center p-4">
      <Spinner className="size-4 text-muted-foreground" />
    </div>
  )
}

/** 8603 as "8.6k", so counts fit in the tabs. */
function compact(count: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count)
}
