"use client"

import { PhoneCall } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useSoftphone } from "@/features/voice/softphone"
import { LiveCallsList } from "@/features/voice/voice-ui"

/**
 * Live calls. The sidebar lists them beside this page; on small screens, where the sidebar is
 * hidden, the list shows here.
 */
export default function CallsPage() {
  const softphone = useSoftphone()
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PhoneCall className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">Live calls</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Calls show here as soon as the AI agent answers. When it hands one over, every available agent&apos;s phone
          rings; the first to answer gets the call and its ticket, with the AI conversation already on it.
        </p>
        <p className="text-xs text-muted-foreground">
          {softphone.status === "registered"
            ? "Your phone is ready for calls."
            : "Set yourself Available for calls, top right, to be rung on handovers."}
        </p>
      </div>
      <Card className="py-0 md:hidden">
        <LiveCallsList />
      </Card>
    </div>
  )
}
