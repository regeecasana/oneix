"use client";

import { SETTABLE_TICKET_STATUSES, type SettableTicketStatus, type TicketDetail } from "@oneix/contracts";
import { type FormEvent, useState } from "react";
import { useMe } from "@/features/auth/queries";
import { statusLabels } from "./labels";
import { useAddComment } from "./queries";

type Mode = "reply" | "note";

const modeStyles: Record<Mode, { border: string; label: string; button: string }> = {
  reply: { border: "border-sky-200", label: "text-sky-700", button: "bg-sky-700 hover:bg-sky-600" },
  note: { border: "border-amber-200", label: "text-amber-700", button: "bg-amber-600 hover:bg-amber-500" },
};

/**
 * Public reply or internal note. A public reply is sent to the customer by email, so the composer
 * says who will receive it. "Send as" changes the status in the same update.
 * Agents whose role allows internal notes only (light agents) don't get the public reply tab.
 */
export function CommentComposer({ ticket }: { ticket: TicketDetail }) {
  const me = useMe();
  const canReply = me.data?.permissions.publicReplies ?? false;
  const modes: Mode[] = canReply ? ["reply", "note"] : ["note"];
  const [chosenMode, setMode] = useState<Mode>("reply");
  const mode: Mode = canReply ? chosenMode : "note";
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<SettableTicketStatus | "">("");
  const addComment = useAddComment(ticket.id);
  const style = modeStyles[mode];
  const recipient = ticket.customer?.name ?? ticket.customer?.email ?? "the customer";

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim() || addComment.isPending) return;
    addComment.mutate(
      { body, public: mode === "reply", status: status || undefined },
      {
        onSuccess: () => {
          setBody("");
          setStatus("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className={`rounded-lg border bg-white ${style.border}`}>
      <div className="flex border-b border-zinc-100 text-sm" role="tablist" aria-label="Comment type">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 font-medium ${
              mode === m ? `border-b-2 ${m === "reply" ? "border-sky-700 text-sky-800" : "border-amber-600 text-amber-800"}` : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {m === "reply" ? "Public reply" : "Internal note"}
          </button>
        ))}
      </div>

      <div className="p-3">
        <label htmlFor="comment" className={`mb-2 block text-xs font-medium ${style.label}`}>
          {mode === "reply"
            ? `${recipient} will receive this by email`
            : canReply
              ? "Visible to agents only"
              : "Visible to agents only. Your role can add internal notes, not public replies."}
        </label>
        <textarea
          id="comment"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={mode === "reply" ? "Write your reply…" : "Add a note…"}
          className="w-full resize-y rounded-md border border-zinc-200 p-2 text-sm focus:border-zinc-400 focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {addComment.isError && <p className="text-sm text-rose-700">{addComment.error.message}</p>}
          <span className="ml-auto text-xs text-zinc-400">Ctrl+Enter</span>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span>Send as</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SettableTicketStatus | "")}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">{statusLabels[ticket.status]} (unchanged)</option>
              {SETTABLE_TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!body.trim() || addComment.isPending}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 ${style.button}`}
          >
            {addComment.isPending ? "Sending…" : mode === "reply" ? "Send reply" : "Add note"}
          </button>
        </div>
      </div>
    </form>
  );
}
