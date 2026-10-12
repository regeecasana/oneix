"use client"

import { PAGE_SIZES, type TicketChannel, type TicketSortField } from "@oneix/contracts"
import type { OnChangeFn, SortingState } from "@tanstack/react-table"
import { ChevronDown, Inbox, Layers } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DataTable } from "@/components/data-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { channelIcons, channelLabels, channelTabLabels } from "@/features/tickets/channels"
import { Pagination } from "@/features/tickets/pagination"
import { type TicketFilters, type TicketSort, useChannelCounts, useTickets } from "@/features/tickets/queries"
import { ticketColumns } from "@/features/tickets/ticket-columns"
import { cn } from "@/lib/utils"

/** Select items and tabs can't have an empty value, so "all" has a name. Status and priority are
 * filtered from their column headers. */
const ALL = "all"

const assigneeOptions = [
  { value: ALL, label: "Everyone" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
]

const numberFormat = new Intl.NumberFormat("en")

/** Channels shown as tabs; the rest go in the "More" menu, so the tab bar never scrolls. */
const VISIBLE_CHANNEL_TABS = 5

export default function InboxPage() {
  const router = useRouter()
  const [filters, setFiltersState] = useState<TicketFilters>({})
  const [channel, setChannelState] = useState<TicketChannel | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  // One column at a time; empty means the server's default (most recently updated first).
  const [sorting, setSortingState] = useState<SortingState>([])
  const sortBy = sorting[0]
  const sort: TicketSort | null = sortBy
    ? { field: sortBy.id as TicketSortField, order: sortBy.desc ? "desc" : "asc" }
    : null

  const counts = useChannelCounts(filters)
  const tickets = useTickets(filters, page, pageSize, sort, channel === ALL ? null : channel)
  const rows = tickets.data?.items ?? []

  // Channels that have tickets, most tickets first; the open one stays listed even at zero.
  const channelCounts = counts.data?.channels ?? []
  const openTabMissing = channel !== ALL && !channelCounts.some((c) => c.channel === channel)
  const allChannels = openTabMissing ? [...channelCounts, { channel, count: 0 }] : channelCounts
  // The busiest channels get tabs. A channel opened from "More" takes the last tab's place.
  let tabs = allChannels.slice(0, VISIBLE_CHANNEL_TABS)
  const openInMore = channel !== ALL && !tabs.some((c) => c.channel === channel)
  if (openInMore) tabs = [...tabs.slice(0, -1), allChannels.find((c) => c.channel === channel)!]
  const moreChannels = allChannels.filter((c) => !tabs.some((t) => t.channel === c.channel))

  // If the list shrinks (tickets solved elsewhere), don't strand the agent on an empty page.
  // Adjusting state during render is React's pattern for state derived from new data.
  const totalPages = tickets.data?.totalPages
  if (totalPages !== undefined && page > totalPages) setPage(totalPages)

  // A new sort, filter, or tab starts again from the first page.
  const setSorting: OnChangeFn<SortingState> = (updater) => {
    setSortingState((current) => (typeof updater === "function" ? updater(current) : updater))
    setPage(1)
  }
  function setFilters(next: TicketFilters) {
    setFiltersState(next)
    setPage(1)
  }
  function setChannel(next: string) {
    setChannelState(next as TicketChannel | typeof ALL)
    setPage(1)
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold">Inbox</h1>
        <Select
          value={filters.assignee ?? ALL}
          onValueChange={(value) => setFilters({ ...filters, assignee: value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Assignee" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assigneeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={channel} onValueChange={setChannel} className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList aria-label="Channel">
            <TabsTrigger value={ALL}>
              <Layers data-icon="inline-start" />
              All
              <TabCount count={counts.data?.total} />
            </TabsTrigger>
            {tabs.map(({ channel: value, count }) => {
              const Icon = channelIcons[value]
              return (
                <TabsTrigger key={value} value={value}>
                  <Icon data-icon="inline-start" />
                  {channelTabLabels[value]}
                  <TabCount count={count} />
                </TabsTrigger>
              )
            })}
          </TabsList>

          {moreChannels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  More
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular-nums">
                    {moreChannels.length}
                  </Badge>
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {moreChannels.map(({ channel: value, count }) => {
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

        {/* One panel: the list for whichever tab is open. */}
        <TabsContent value={channel} className="flex flex-col gap-4">
          {tickets.isError && (
            <Alert variant="destructive">
              <AlertDescription>{tickets.error.message}</AlertDescription>
            </Alert>
          )}

          <Card className={cn("py-0", tickets.isPlaceholderData && "opacity-60")}>
            <DataTable
              columns={ticketColumns(filters, setFilters)}
              data={rows}
              getRowId={(ticket) => ticket.id}
              sorting={sorting}
              onSortingChange={setSorting}
              onRowClick={(ticket) => router.push(`/tickets/${ticket.id}`)}
              isLoading={tickets.isPending}
              empty={
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No tickets here</EmptyTitle>
                    <EmptyDescription>
                      No {channel === ALL ? "" : `${channelLabels[channel].toLowerCase()} `}tickets match these filters.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
            />
          </Card>

          {tickets.data && tickets.data.total > 0 && (
            <Pagination
              page={tickets.data.page}
              pageSize={tickets.data.pageSize}
              total={tickets.data.total}
              totalPages={tickets.data.totalPages}
              onPageChange={(next) => {
                setPage(next)
                window.scrollTo({ top: 0 })
              }}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TabCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null
  return (
    <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">
      {numberFormat.format(count)}
    </Badge>
  )
}
