"use client"

import { ArrowLeft, Link2, Lock } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMe } from "@/features/auth/queries"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { CommentComposer } from "@/features/tickets/comment-composer"
import { ChannelLabel } from "@/features/tickets/channels"
import { StatusBadge } from "@/features/tickets/labels"
import { useTicket } from "@/features/tickets/queries"
import { Thread } from "@/features/tickets/thread"
import { TicketProperties } from "@/features/tickets/ticket-properties"

/**
 * A ticket fills the screen: the conversation on the left with the composer docked under it, and
 * the ticket's properties and fields on the right. On large screens the page itself never scrolls;
 * the conversation and the side panel each scroll on their own.
 */
export default function TicketPage() {
  const { number } = useParams<{ number: string }>()
  const ticket = useTicket(number)
  const me = useMe()
  // Accounts not linked to a Zendesk user can read but not act.
  const canAct = me.data?.permissions.linked ?? false

  if (ticket.isPending || ticket.isError) {
    return (
      <div className="flex flex-col gap-4 px-6 py-6">
        <BackToInbox />
        {ticket.isPending ? (
          <>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{ticket.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  const data = ticket.data
  return (
    <div className="flex flex-col lg:h-full lg:min-h-0">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-4 py-2.5">
        <BackToInbox />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={data.subject}>
          <span className="mr-2 font-normal text-muted-foreground tabular-nums">#{data.number}</span>
          {data.subject}
        </h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChannelLabel channel={data.channel} detail={data.channelDetail} />
          <StatusBadge status={data.status} />
          {ticket.isFetching && <Spinner className="size-4" />}
        </span>
      </header>

      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <Thread entries={data.thread} className="lg:min-h-0 lg:flex-1" />
          <div className="shrink-0 border-t bg-background px-4 py-3">
            {data.status === "closed" ? (
              <ComposerNotice icon={<Lock className="size-4" />}>
                This ticket is closed. Closed tickets can&apos;t be replied to.
              </ComposerNotice>
            ) : canAct ? (
              <CommentComposer ticket={data} />
            ) : (
              <ComposerNotice icon={<Link2 className="size-4" />}>
                Your account isn&apos;t linked to a Zendesk user yet, so you can&apos;t reply. Ask a workspace admin
                to link it.
              </ComposerNotice>
            )}
          </div>
        </section>

        <aside className="shrink-0 border-t bg-muted/20 p-4 lg:w-88 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <TicketProperties ticket={data} readOnly={!canAct} />
        </aside>
      </div>
    </div>
  )
}

function BackToInbox() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link href="/inbox">
        <ArrowLeft data-icon="inline-start" />
        Inbox
      </Link>
    </Button>
  )
}

function ComposerNotice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      {icon}
      {children}
    </p>
  )
}
