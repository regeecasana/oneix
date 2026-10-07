"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusBadge } from "@/features/tickets/labels";
import { CommentComposer } from "@/features/tickets/comment-composer";
import { useTicket } from "@/features/tickets/queries";
import { Thread } from "@/features/tickets/thread";
import { TicketProperties } from "@/features/tickets/ticket-properties";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const ticket = useTicket(id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <Link href="/inbox" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Inbox
      </Link>

      {ticket.isPending && <p className="mt-6 text-sm text-zinc-500">Loading ticket…</p>}
      {ticket.isError && <p className="mt-6 text-sm text-rose-700">{ticket.error.message}</p>}

      {ticket.data && (
        <>
          <header className="mt-3 mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              <span className="mr-2 font-normal text-zinc-400 tabular-nums">#{ticket.data.number}</span>
              {ticket.data.subject}
            </h1>
            <StatusBadge status={ticket.data.status} />
            {ticket.isFetching && <span className="text-xs text-zinc-400">Refreshing…</span>}
          </header>

          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <section className="min-w-0 space-y-6">
              <Thread entries={ticket.data.thread} />
              {ticket.data.status !== "closed" && <CommentComposer ticket={ticket.data} />}
            </section>
            <TicketProperties ticket={ticket.data} />
          </div>
        </>
      )}
    </div>
  );
}
