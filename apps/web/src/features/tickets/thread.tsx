import type { ThreadEntry } from "@oneix/contracts";
import { dateTime, timeAgo } from "@/lib/format";

export function Thread({ entries }: { entries: ThreadEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No messages yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => {
        const note = entry.kind === "internal_note";
        return (
          <li
            key={entry.id}
            className={`rounded-lg border p-4 ${note ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}
          >
            <div className="mb-2 flex items-baseline gap-2 text-sm">
              <span className="font-medium">{entry.author.name}</span>
              {entry.author.type === "customer" && <span className="text-xs text-zinc-500">Customer</span>}
              {note && <span className="text-xs font-medium text-amber-700">Internal note</span>}
              <time className="ml-auto text-xs text-zinc-500" dateTime={entry.createdAt} title={dateTime(entry.createdAt)}>
                {timeAgo(entry.createdAt)}
              </time>
            </div>
            <p className="text-sm whitespace-pre-wrap text-zinc-800">{entry.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
