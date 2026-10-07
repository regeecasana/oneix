"use client"

import {
  SETTABLE_TICKET_STATUSES,
  type SettableTicketStatus,
  TICKET_PRIORITIES,
  type TicketDetail,
  type TicketPriority,
  type UpdateTicketRequest,
} from "@oneix/contracts"
import { Mail, Phone } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { priorityLabels, statusLabels } from "./labels"
import { useAgents, useUpdateTicket } from "./queries"

/** Select items can't have an empty value, so "none" has a name. */
const NONE = "none"

export function TicketProperties({ ticket }: { ticket: TicketDetail }) {
  const agents = useAgents()
  const update = useUpdateTicket(ticket.id)
  const closed = ticket.status === "closed"
  const disabled = closed || update.isPending

  function save(changes: UpdateTicketRequest) {
    update.mutate(changes, { onError: (error) => toast.error(error.message) })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Properties
            {update.isPending && <Spinner className="size-3.5 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Status" id="status">
            <Select
              value={ticket.status}
              disabled={disabled}
              onValueChange={(value) => save({ status: value as SettableTicketStatus })}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* `new` and `closed` are set by the system, so they only show when current. */}
                {!SETTABLE_TICKET_STATUSES.includes(ticket.status as SettableTicketStatus) && (
                  <SelectItem value={ticket.status} disabled>
                    {statusLabels[ticket.status]}
                  </SelectItem>
                )}
                {SETTABLE_TICKET_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Priority" id="priority">
            <Select
              value={ticket.priority ?? NONE}
              disabled={disabled}
              onValueChange={(value) => save({ priority: value === NONE ? null : (value as TicketPriority) })}
            >
              <SelectTrigger id="priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {TICKET_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priorityLabels[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Assignee" id="assignee">
            <Select
              value={ticket.assignee?.id ?? NONE}
              disabled={disabled || agents.isPending}
              onValueChange={(value) => save({ assigneeId: value === NONE ? null : value })}
            >
              <SelectTrigger id="assignee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {/* Keeps the current assignee visible even before the agent list loads. */}
                {ticket.assignee && !agents.data?.items.some((a) => a.id === ticket.assignee?.id) && (
                  <SelectItem value={ticket.assignee.id}>{ticket.assignee.name}</SelectItem>
                )}
                {agents.data?.items.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {closed && <p className="text-xs text-muted-foreground">Closed tickets can&apos;t be changed.</p>}
        </CardContent>
      </Card>

      {ticket.customer && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {ticket.customer.name && <p className="font-medium">{ticket.customer.name}</p>}
            {(ticket.customer.email || ticket.customer.phone) && <Separator />}
            {ticket.customer.email && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" />
                <span className="truncate">{ticket.customer.email}</span>
              </p>
            )}
            {ticket.customer.phone && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4" />
                {ticket.customer.phone}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
