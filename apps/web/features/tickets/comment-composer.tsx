"use client"

import { SETTABLE_TICKET_STATUSES, type SettableTicketStatus, type TicketDetail } from "@oneix/contracts"
import { Lock, Send } from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useMe } from "@/features/auth/queries"
import { cn } from "@/lib/utils"
import { statusLabels } from "./labels"
import { useAddComment } from "./queries"

type Mode = "reply" | "note"

/** Select items can't have an empty value, so "keep the status" has a name. */
const UNCHANGED = "unchanged"

/**
 * Public reply or internal note, docked under the conversation. A public reply is sent to the
 * customer by email, so the composer says who will receive it. "Send as" changes the status in the
 * same update. Agents whose role allows internal notes only (light agents) don't get the public
 * reply tab.
 */
export function CommentComposer({ ticket }: { ticket: TicketDetail }) {
  const me = useMe()
  const canReply = me.data?.permissions.publicReplies ?? false
  const [chosenMode, setMode] = useState<Mode>("reply")
  const mode: Mode = canReply ? chosenMode : "note"
  const [body, setBody] = useState("")
  const [status, setStatus] = useState<SettableTicketStatus | typeof UNCHANGED>(UNCHANGED)
  const addComment = useAddComment(ticket.number)
  const recipient = ticket.customer?.name ?? ticket.customer?.email ?? "the customer"
  const note = mode === "note"

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!body.trim() || addComment.isPending) return
    addComment.mutate(
      { body, public: mode === "reply", status: status === UNCHANGED ? undefined : status },
      {
        onSuccess: () => {
          setBody("")
          setStatus(UNCHANGED)
          toast.success(mode === "reply" ? `Reply sent to ${recipient}` : "Note added")
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex flex-col rounded-xl bg-card ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-ring/40",
        note && "bg-amber-50/70 ring-amber-300 focus-within:ring-amber-400 dark:bg-amber-500/5 dark:ring-amber-500/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2">
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList variant="line">
            {canReply && <TabsTrigger value="reply">Public reply</TabsTrigger>}
            <TabsTrigger value="note">
              <Lock data-icon="inline-start" />
              Internal note
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className={cn("text-xs text-muted-foreground", note && "text-amber-700 dark:text-amber-400")}>
          {mode === "reply"
            ? `To ${recipient}, by email`
            : canReply
              ? "Visible to agents only"
              : "Visible to agents only. Your role can add internal notes, not public replies."}
        </span>
      </div>

      <Textarea
        id="comment"
        aria-label={mode === "reply" ? "Reply" : "Internal note"}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
        }}
        placeholder={mode === "reply" ? "Write your reply…" : "Add a note…"}
        className="max-h-48 min-h-20 resize-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <div className="flex flex-wrap items-center justify-end gap-2 px-3 pb-3">
        <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">Ctrl+Enter to send</span>
        <span className="text-xs text-muted-foreground">Send as</span>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger size="sm" aria-label="Status after sending">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNCHANGED}>{statusLabels[ticket.status]} (unchanged)</SelectItem>
            {SETTABLE_TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!body.trim() || addComment.isPending}>
          {addComment.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          {mode === "reply" ? "Send reply" : "Add note"}
        </Button>
      </div>
    </form>
  )
}
