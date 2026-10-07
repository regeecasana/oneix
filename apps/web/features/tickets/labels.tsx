import type { TicketPriority, TicketStatus } from "@oneix/contracts"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const statusLabels: Record<TicketStatus, string> = {
  new: "New",
  open: "Open",
  pending: "Pending",
  on_hold: "On hold",
  solved: "Solved",
  closed: "Closed",
}

const statusStyles: Record<TicketStatus, string> = {
  new: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  open: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  pending: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300",
  on_hold: "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300",
  solved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
}

export const priorityLabels: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return <Badge className={cn(statusStyles[status], className)}>{statusLabels[status]}</Badge>
}

export function PriorityLabel({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <span className="text-muted-foreground">—</span>
  const raised = priority === "urgent" || priority === "high"
  return (
    <span className={raised ? "font-medium text-destructive" : "text-muted-foreground"}>{priorityLabels[priority]}</span>
  )
}

/** A Zendesk role, colored by kind: admins stand out, light agents read as limited. */
export function RoleBadge({ role }: { role: string }) {
  const name = role.toLowerCase()
  const style = name.includes("admin")
    ? "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-300"
    : name.includes("light")
      ? "bg-muted text-muted-foreground"
      : name.includes("moderator")
        ? "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300"
        : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300"
  return <Badge className={style}>{role}</Badge>
}
