"use client"

import {
  NO_PRIORITY,
  type PriorityFilter,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketStatus,
  type TicketSummary,
} from "@oneix/contracts"
import type { ColumnDef } from "@tanstack/react-table"
import { FilterHeader, type FilterOption, SortableHeader } from "@/components/data-table"
import { timeAgo } from "@/lib/format"
import { ChannelLabel } from "./channels"
import { PriorityLabel, priorityLabels, StatusBadge, statusLabels } from "./labels"
import type { TicketFilters } from "./queries"

const statusOptions: FilterOption[] = TICKET_STATUSES.map((status) => ({ value: status, label: statusLabels[status] }))

const priorityOptions: FilterOption[] = [
  ...[...TICKET_PRIORITIES].reverse().map((priority) => ({ value: priority, label: priorityLabels[priority] })),
  { value: NO_PRIORITY, label: "No priority" },
]

/**
 * Inbox columns. Each sortable column's ID is the field the API sorts by; its accessor is what
 * makes it sortable in TanStack Table, while the sorting itself happens on the server.
 * Status and priority filter by value instead of sorting.
 */
export function ticketColumns(
  filters: TicketFilters,
  onFiltersChange: (filters: TicketFilters) => void,
): ColumnDef<TicketSummary>[] {
  return [
    {
      id: "number",
      accessorFn: (ticket) => ticket.number,
      header: ({ column }) => <SortableHeader column={column} title="#" />,
      cell: ({ row }) => <span className="text-muted-foreground tabular-nums">#{row.original.number}</span>,
      meta: { className: "pl-4", width: 96 },
    },
    {
      id: "subject",
      accessorFn: (ticket) => ticket.subject,
      header: ({ column }) => <SortableHeader column={column} title="Subject" />,
      cell: ({ row }) => (
        <span className="block truncate font-medium" title={row.original.subject}>
          {row.original.subject}
        </span>
      ),
    },
    {
      id: "channel",
      accessorFn: (ticket) => ticket.channel,
      header: ({ column }) => <SortableHeader column={column} title="Channel" />,
      cell: ({ row }) => <ChannelLabel channel={row.original.channel} detail={row.original.channelDetail} />,
      meta: { width: 176 },
    },
    {
      id: "customer",
      accessorFn: (ticket) => ticket.customer?.name ?? null,
      header: ({ column }) => <SortableHeader column={column} title="Customer" />,
      cell: ({ row }) => {
        const customer = row.original.customer
        const label = customer?.name ?? customer?.email ?? customer?.phone ?? "—"
        return (
          <span className="block truncate text-muted-foreground" title={label}>
            {label}
          </span>
        )
      },
      meta: { width: 184 },
    },
    {
      id: "status",
      enableSorting: false,
      header: () => (
        <FilterHeader
          title="Status"
          options={statusOptions}
          selected={filters.status ?? []}
          onChange={(selected) => onFiltersChange({ ...filters, status: selected as TicketStatus[] })}
        />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      meta: { width: 120 },
    },
    {
      id: "priority",
      enableSorting: false,
      header: () => (
        <FilterHeader
          title="Priority"
          options={priorityOptions}
          selected={filters.priority ?? []}
          onChange={(selected) => onFiltersChange({ ...filters, priority: selected as PriorityFilter[] })}
        />
      ),
      cell: ({ row }) => <PriorityLabel priority={row.original.priority} />,
      meta: { width: 120 },
    },
    {
      id: "assignee",
      accessorFn: (ticket) => ticket.assignee?.name ?? null,
      header: ({ column }) => <SortableHeader column={column} title="Assignee" />,
      cell: ({ row }) => {
        const label = row.original.assignee?.name ?? "Unassigned"
        return (
          <span className="block truncate text-muted-foreground" title={label}>
            {label}
          </span>
        )
      },
      meta: { width: 168 },
    },
    {
      id: "updatedAt",
      accessorFn: (ticket) => ticket.updatedAt,
      header: ({ column }) => <SortableHeader column={column} title="Updated" align="right" />,
      cell: ({ row }) => (
        <span className="block text-right whitespace-nowrap text-muted-foreground" title={row.original.updatedAt}>
          {timeAgo(row.original.updatedAt)}
        </span>
      ),
      meta: { className: "pr-4 text-right", width: 120 },
    },
  ]
}
