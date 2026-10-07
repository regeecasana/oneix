"use client";

import {
  SETTABLE_TICKET_STATUSES,
  TICKET_PRIORITIES,
  type TicketDetail,
  type TicketPriority,
  type SettableTicketStatus,
} from "@oneix/contracts";
import type { ReactNode } from "react";
import { priorityLabels, statusLabels } from "./labels";
import { useAgents, useUpdateTicket } from "./queries";

const selectClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-zinc-50";

export function TicketProperties({ ticket }: { ticket: TicketDetail }) {
  const agents = useAgents();
  const update = useUpdateTicket(ticket.id);
  const closed = ticket.status === "closed";
  const disabled = closed || update.isPending;

  return (
    <aside className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <Field label="Status">
        <select
          className={selectClass}
          value={ticket.status}
          disabled={disabled}
          onChange={(e) => update.mutate({ status: e.target.value as SettableTicketStatus })}
        >
          {/* `new` and `closed` are set by the system, so they only show when current. */}
          {!SETTABLE_TICKET_STATUSES.includes(ticket.status as SettableTicketStatus) && (
            <option value={ticket.status} disabled>
              {statusLabels[ticket.status]}
            </option>
          )}
          {SETTABLE_TICKET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Priority">
        <select
          className={selectClass}
          value={ticket.priority ?? ""}
          disabled={disabled}
          onChange={(e) => update.mutate({ priority: (e.target.value || null) as TicketPriority | null })}
        >
          <option value="">None</option>
          {TICKET_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabels[priority]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Assignee">
        <select
          className={selectClass}
          value={ticket.assignee?.id ?? ""}
          disabled={disabled || agents.isPending}
          onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {/* Keeps the current assignee visible even before the agent list loads. */}
          {ticket.assignee && !agents.data?.items.some((a) => a.id === ticket.assignee?.id) && (
            <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
          )}
          {agents.data?.items.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </Field>

      {closed && <p className="text-xs text-zinc-500">Closed tickets can&apos;t be changed.</p>}
      {update.isPending && <p className="text-xs text-zinc-500">Saving…</p>}
      {update.isError && <p className="text-xs text-rose-700">{update.error.message}</p>}

      {ticket.customer && (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Customer</h3>
          <dl className="space-y-1 text-sm">
            {ticket.customer.name && <dd className="font-medium">{ticket.customer.name}</dd>}
            {ticket.customer.email && <dd className="text-zinc-600">{ticket.customer.email}</dd>}
            {ticket.customer.phone && <dd className="text-zinc-600">{ticket.customer.phone}</dd>}
          </dl>
        </div>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      {children}
    </label>
  );
}
