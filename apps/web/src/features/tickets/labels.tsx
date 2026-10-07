import type { TicketPriority, TicketStatus } from "@oneix/contracts";

export const statusLabels: Record<TicketStatus, string> = {
  new: "New",
  open: "Open",
  pending: "Pending",
  on_hold: "On hold",
  solved: "Solved",
  closed: "Closed",
};

const statusStyles: Record<TicketStatus, string> = {
  new: "bg-amber-100 text-amber-800 ring-amber-200",
  open: "bg-rose-100 text-rose-800 ring-rose-200",
  pending: "bg-sky-100 text-sky-800 ring-sky-200",
  on_hold: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  solved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  closed: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

export const priorityLabels: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <span className="text-zinc-400">—</span>;
  const urgent = priority === "urgent" || priority === "high";
  return <span className={urgent ? "font-medium text-rose-700" : "text-zinc-600"}>{priorityLabels[priority]}</span>;
}
