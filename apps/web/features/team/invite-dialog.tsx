"use client"

import type { OneTimeLinkResponse, UserRole } from "@oneix/contracts"
import { ChevronDown, UserPlus, UserRoundPlus } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAgentOptions, useBackendDirectory, useInviteMember } from "./queries"
import { CREATE_NEW, ZendeskUserSelect } from "./zendesk-user-select"

/**
 * Invites someone to the workspace: their oneix role and the Zendesk user their account acts as.
 * That's an existing Zendesk user (picking one fills in the name and email), a new Zendesk agent
 * created now, or none for later.
 *
 * @param createAgent opens as "Create agent", with a new Zendesk agent already chosen.
 */
export function InviteDialog({
  onInvited,
  createAgent = false,
}: {
  onInvited: (link: OneTimeLinkResponse | null, name: string) => void
  createAgent?: boolean
}) {
  const initialZendeskUser = createAgent ? CREATE_NEW : null
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<UserRole>("agent")
  const [zendeskUser, setZendeskUser] = useState<string | null>(initialZendeskUser)
  const [zendeskRole, setZendeskRole] = useState<string | null>(null)
  const [groupIds, setGroupIds] = useState<string[]>([])
  const creating = zendeskUser === CREATE_NEW
  const directory = useBackendDirectory()
  const options = useAgentOptions(open && creating)
  const invite = useInviteMember()

  function pickZendeskUser(value: string | null) {
    setZendeskUser(value)
    const user = directory.data?.items.find((u) => u.externalId === value)
    if (user) {
      setName(user.name)
      if (user.email) setEmail(user.email)
    }
  }

  function reset() {
    setEmail("")
    setName("")
    setRole("agent")
    setZendeskUser(initialZendeskUser)
    setZendeskRole(null)
    setGroupIds([])
    invite.reset()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (creating && !zendeskRole) return
    invite.mutate(
      {
        email,
        name,
        role,
        ...(creating
          ? { newZendeskAgent: { roleKey: zendeskRole!, groupIds } }
          : { zendeskUserId: zendeskUser }),
      },
      {
        onSuccess: (result) => {
          setOpen(false)
          reset()
          if (creating) toast.success(`${result.member.name} was created in Zendesk and linked`)
          if (!result.link) toast.success(`${result.member.name} already had an account and was added`)
          onInvited(result.link, result.member.name)
        },
      },
    )
  }

  const selectedRole = options.data?.roles.find((r) => r.key === zendeskRole)
  const groupNames = (options.data?.groups ?? []).filter((g) => groupIds.includes(g.id)).map((g) => g.name)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        {createAgent ? (
          <Button variant="outline">
            <UserRoundPlus data-icon="inline-start" />
            Create agent
          </Button>
        ) : (
          <Button>
            <UserPlus data-icon="inline-start" />
            Invite person
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{createAgent ? "Create an agent" : "Invite someone to this workspace"}</DialogTitle>
            <DialogDescription>
              They get a oneix account of their own, linked to a Zendesk user so their replies and changes are written as
              them, with their Zendesk permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-zendesk">Zendesk user</Label>
            <ZendeskUserSelect
              id="invite-zendesk"
              directory={directory.data?.items ?? []}
              value={zendeskUser}
              onChange={pickZendeskUser}
              disabled={directory.isPending}
              allowCreate
            />
          </div>

          {creating && (
            <div className="flex flex-col gap-4 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                oneix creates the agent in Zendesk, already verified, so Zendesk emails them nothing; they only use oneix.
                A full agent uses a Zendesk seat.
              </p>
              {options.isPending && <Skeleton className="h-16 w-full" />}
              {options.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{options.error.message}</AlertDescription>
                </Alert>
              )}
              {options.data && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invite-zendesk-role">Zendesk role</Label>
                    <Select value={zendeskRole ?? undefined} onValueChange={setZendeskRole}>
                      <SelectTrigger id="invite-zendesk-role" className="w-full">
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.data.roles.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedRole && !selectedRole.publicReplies && (
                      <p className="text-xs text-muted-foreground">This role can add internal notes only.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invite-zendesk-groups">Zendesk groups</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button id="invite-zendesk-groups" type="button" variant="outline" className="justify-between font-normal">
                          <span className="truncate">{groupNames.length > 0 ? groupNames.join(", ") : "Default group"}</span>
                          <ChevronDown data-icon="inline-end" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                        {options.data.groups.map((group) => (
                          <DropdownMenuCheckboxItem
                            key={group.id}
                            checked={groupIds.includes(group.id)}
                            onCheckedChange={(checked) =>
                              setGroupIds((current) =>
                                checked ? [...current, group.id] : current.filter((id) => id !== group.id),
                              )
                            }
                            onSelect={(event) => event.preventDefault()}
                          >
                            {group.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
          )}

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
            <Button type="submit" disabled={invite.isPending || (creating && !zendeskRole)}>
              {invite.isPending && <Spinner data-icon="inline-start" />}
              {creating ? "Create in Zendesk and invite" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
