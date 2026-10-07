"use client";

import { type FormEvent, useState } from "react";
import { useAddNote } from "./queries";

export function NoteComposer({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const addNote = useAddNote(ticketId);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim() || addNote.isPending) return;
    addNote.mutate({ body }, { onSuccess: () => setBody("") });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-amber-200 bg-white p-3">
      <label htmlFor="note" className="mb-2 block text-xs font-medium text-amber-700">
        Internal note — visible to agents only
      </label>
      <textarea
        id="note"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Add a note…"
        className="w-full resize-y rounded-md border border-zinc-200 p-2 text-sm focus:border-zinc-400 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        {addNote.isError && <p className="text-sm text-rose-700">{addNote.error.message}</p>}
        <span className="ml-auto text-xs text-zinc-400">Ctrl+Enter</span>
        <button
          type="submit"
          disabled={!body.trim() || addNote.isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          {addNote.isPending ? "Adding…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
