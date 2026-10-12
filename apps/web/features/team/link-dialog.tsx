"use client"

import type { OneTimeLinkResponse } from "@oneix/contracts"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { dateTime } from "@/lib/format"

/**
 * Shows a one-time invite or reset link to copy. There is no email sending yet, so the admin
 * sends it to the person themselves.
 */
export function LinkDialog({
  link,
  personName,
  onClose,
}: {
  link: OneTimeLinkResponse | null
  personName: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isInvite = link?.purpose === "invite"

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
  }

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isInvite ? `Invite link for ${personName}` : `Password reset link for ${personName}`}</DialogTitle>
          <DialogDescription>
            Send this link to them yourself; oneix doesn&apos;t send email yet. It works once
            {link ? ` and expires ${dateTime(link.expiresAt)}` : ""}. Creating a new link turns this one off.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
