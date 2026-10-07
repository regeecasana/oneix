"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { CommentComposer } from "@/features/tickets/comment-composer"
import { StatusBadge } from "@/features/tickets/labels"
import { useTicket } from "@/features/tickets/queries"
import { Thread } from "@/features/tickets/thread"
import { TicketProperties } from "@/features/tickets/ticket-properties"

export default function TicketPage() {
  const { id } = useParams<{ id: string }>()
  const ticket = useTicket(id)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/inbox">
          <ArrowLeft data-icon="inline-start" />
          Inbox
        </Link>
      </Button>

      {ticket.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {ticket.isError && (
        <Alert variant="destructive">
          <AlertDescription>{ticket.error.message}</AlertDescription>
        </Alert>
      )}

      {ticket.data && (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              <span className="mr-2 font-normal text-muted-foreground tabular-nums">#{ticket.data.number}</span>
              {ticket.data.subject}
            </h1>
            <StatusBadge status={ticket.data.status} />
            {ticket.isFetching && <Spinner className="size-4 text-muted-foreground" />}
          </header>

          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <section className="flex min-w-0 flex-col gap-6">
              <Thread entries={ticket.data.thread} />
              {ticket.data.status !== "closed" && <CommentComposer ticket={ticket.data} />}
            </section>
            <TicketProperties ticket={ticket.data} />
          </div>
        </>
      )}
    </div>
  )
}
