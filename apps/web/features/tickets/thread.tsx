import type { ThreadEntry } from "@oneix/contracts"
import { Lock } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { dateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?"
}

export function Thread({ entries }: { entries: ThreadEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet.</p>
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const note = entry.kind === "internal_note"
        return (
          <li key={entry.id}>
            <Card
              size="sm"
              className={cn(note && "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30")}
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>{initials(entry.author.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{entry.author.name}</span>
                  {entry.author.type === "customer" && <Badge variant="secondary">Customer</Badge>}
                  {note && (
                    <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                      <Lock data-icon="inline-start" />
                      Internal note
                    </Badge>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>
                      {timeAgo(entry.createdAt)}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>{dateTime(entry.createdAt)}</TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ol>
  )
}
