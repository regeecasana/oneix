import type { TicketChannel } from "@oneix/contracts"
import {
  Code,
  type LucideIcon,
  Mail,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Phone,
  Share2,
  Sun,
  SquarePen,
} from "lucide-react"

export const channelLabels: Record<TicketChannel, string> = {
  email: "Email",
  chat: "Chat",
  messaging: "Messaging",
  sunshine_conversations: "Sunshine Conversations",
  social: "Social",
  phone: "Phone",
  web_form: "Web form",
  api: "API",
  other: "Other",
}

/** Shorter names for the inbox tabs, where space is tight. */
export const channelTabLabels: Record<TicketChannel, string> = {
  ...channelLabels,
  sunshine_conversations: "Sunshine",
}

export const channelIcons: Record<TicketChannel, LucideIcon> = {
  email: Mail,
  chat: MessageCircle,
  messaging: MessagesSquare,
  sunshine_conversations: Sun,
  social: Share2,
  phone: Phone,
  web_form: SquarePen,
  api: Code,
  other: MoreHorizontal,
}

/** Channel with its specific source when there is one: "Social · WhatsApp". */
export function ChannelLabel({ channel, detail }: { channel: TicketChannel; detail: string | null }) {
  const Icon = channelIcons[channel]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {channelLabels[channel]}
      {detail && detail !== channelLabels[channel] && <span className="text-muted-foreground/70">· {detail}</span>}
    </span>
  )
}
