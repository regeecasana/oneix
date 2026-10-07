"use client";

import { TICKET_STATUSES, type TicketStatus } from "@oneix/contracts";
import Link from "next/link";
import { useState } from "react";
import { PriorityLabel, StatusBadge, statusLabels } from "@/features/tickets/labels";
import { type TicketFilters, useTickets } from "@/features/tickets/queries";
import { timeAgo } from "@/lib/format";

const assigneeOptions = [
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "", label: "Everyone" },
];

export default function InboxPage() {
  const [filters, setFilters] = useState<TicketFilters>({ assignee: "me" });
  const tickets = useTickets(filters);
  const rows = tickets.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-semibold">Inbox</h1>
        <label className="text-sm">
          <span className="sr-only">Status</span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as TicketStatus | undefined })}
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Assignee</span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            value={filters.assignee ?? ""}
            onChange={(e) => setFilters({ ...filters, assignee: e.target.value || undefined })}
          >
            {assigneeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">Ticket</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Assignee</th>
              <th className="px-4 py-2.5 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-zinc-50">
                <td className="max-w-md px-4 py-3">
                  <Link href={`/tickets/${ticket.id}`} className="block">
                    <span className="mr-2 text-zinc-400 tabular-nums">#{ticket.number}</span>
                    <span className="font-medium text-zinc-900">{ticket.subject}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {ticket.customer?.name ?? ticket.customer?.email ?? ticket.customer?.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityLabel priority={ticket.priority} />
                </td>
                <td className="px-4 py-3 text-zinc-600">{ticket.assignee?.name ?? "Unassigned"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-zinc-500" title={ticket.updatedAt}>
                  {timeAgo(ticket.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tickets.isPending && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading tickets…</p>}
        {tickets.isError && (
          <p className="px-4 py-8 text-center text-sm text-rose-700">{tickets.error.message}</p>
        )}
        {tickets.isSuccess && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No tickets match these filters.</p>
        )}
      </div>

      {tickets.hasNextPage && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void tickets.fetchNextPage()}
            disabled={tickets.isFetchingNextPage}
            className="rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {tickets.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
