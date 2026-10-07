"use client"

import { PAGE_SIZES, TICKET_STATUSES, type TicketStatus } from "@oneix/contracts"
import { Inbox } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PriorityLabel, StatusBadge, statusLabels } from "@/features/tickets/labels"
import { Pagination } from "@/features/tickets/pagination"
import { type TicketFilters, useTickets } from "@/features/tickets/queries"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Select items can't have an empty value, so "all" has a name. */
const ALL = "all"

const assigneeOptions = [
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: ALL, label: "Everyone" },
]

export default function InboxPage() {
  const router = useRouter()
  const [filters, setFiltersState] = useState<TicketFilters>({ assignee: "me" })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const tickets = useTickets(filters, page, pageSize)
  const rows = tickets.data?.items ?? []

  // If the list shrinks (tickets solved elsewhere), don't strand the agent on an empty page.
  // Adjusting state during render is React's pattern for state derived from new data.
  const totalPages = tickets.data?.totalPages
  if (totalPages !== undefined && page > totalPages) setPage(totalPages)

  // A different filter starts again from the first page.
  function setFilters(next: TicketFilters) {
    setFiltersState(next)
    setPage(1)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold">Inbox</h1>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) => setFilters({ ...filters, status: value === ALL ? undefined : (value as TicketStatus) })}
        >
          <SelectTrigger aria-label="Status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TICKET_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {tickets.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tickets.error.message}</AlertDescription>
        </Alert>
      )}

      <Card className={cn("py-0", tickets.isPlaceholderData && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Ticket</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="pr-4 text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.isPending &&
              Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="px-4">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {rows.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => router.push(`/tickets/${ticket.id}`)}
              >
                <TableCell className="max-w-md pl-4">
                  <span className="mr-2 text-muted-foreground tabular-nums">#{ticket.number}</span>
                  <span className="font-medium">{ticket.subject}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ticket.customer?.name ?? ticket.customer?.email ?? ticket.customer?.phone ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <PriorityLabel priority={ticket.priority} />
                </TableCell>
                <TableCell className="text-muted-foreground">{ticket.assignee?.name ?? "Unassigned"}</TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground" title={ticket.updatedAt}>
                  {timeAgo(ticket.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {tickets.isSuccess && rows.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>No tickets here</EmptyTitle>
              <EmptyDescription>No tickets match these filters. Try another status or Everyone.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
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
    </div>
  )
}
