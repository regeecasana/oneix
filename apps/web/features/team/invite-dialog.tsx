"use client"

import type { OneTimeLinkResponse, UserRole } from "@oneix/contracts"
import { UserPlus } from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useBackendDirectory, useInviteMember } from "./queries"
import { ZendeskUserSelect } from "./zendesk-user-select"

/**
 * Invites someone to the workspace: their oneix role and, optionally, the Zendesk user their
 * account is linked to. Picking a Zendesk user fills in the name and email.
 */
export function InviteDialog({ onInvited }: { onInvited: (link: OneTimeLinkResponse | null, name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<UserRole>("agent")
  const [zendeskUserId, setZendeskUserId] = useState<string | null>(null)
  const directory = useBackendDirectory()
  const invite = useInviteMember()

  function pickZendeskUser(externalId: string | null) {
    setZendeskUserId(externalId)
    const user = directory.data?.items.find((u) => u.externalId === externalId)
    if (user) {
      setName(user.name)
      if (user.email) setEmail(user.email)
    }
  }

  function reset() {
    setEmail("")
    setName("")
    setRole("agent")
    setZendeskUserId(null)
    invite.reset()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    invite.mutate(
      { email, name, role, zendeskUserId },
      {
        onSuccess: (result) => {
          setOpen(false)
          reset()
          if (!result.link) toast.success(`${result.member.name} already had an account and was added`)
          onInvited(result.link, result.member.name)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus data-icon="inline-start" />
          Invite person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Invite someone to this workspace</DialogTitle>
            <DialogDescription>
              They get a oneix account of their own. Link it to their Zendesk user so their replies and changes are
              written as them, with their Zendesk permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-zendesk">Zendesk user</Label>
            <ZendeskUserSelect
              id="invite-zendesk"
              directory={directory.data?.items ?? []}
              value={zendeskUserId}
              onChange={pickZendeskUser}
              disabled={directory.isPending}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-role">oneix role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin: manages the team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {invite.isError && (
            <Alert variant="destructive">
              <AlertDescription>{invite.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending && <Spinner data-icon="inline-start" />}
              Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
