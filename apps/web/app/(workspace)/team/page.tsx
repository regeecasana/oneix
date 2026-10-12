"use client"

import type { OneTimeLinkResponse, TeamMember, UpdateMemberRequest, UserRole } from "@oneix/contracts"
import { KeyRound, Link2, MoreHorizontal, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/features/auth/queries"
import { InviteDialog } from "@/features/team/invite-dialog"
import { LinkDialog } from "@/features/team/link-dialog"
import { useBackendDirectory, useIssueLink, useTeam, useUpdateMember } from "@/features/team/queries"
import { ZendeskUserSelect } from "@/features/team/zendesk-user-select"
import { RoleBadge } from "@/features/tickets/labels"
import { timeAgo } from "@/lib/format"

const accountBadges: Record<TeamMember["account"], { label: string; className: string }> = {
  invited: { label: "Invited", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300" },
  disabled: { label: "Disabled", className: "bg-muted text-muted-foreground" },
}

export default function TeamPage() {
  const me = useMe()
  const team = useTeam()
  const directory = useBackendDirectory()
  const update = useUpdateMember()
  const issueLink = useIssueLink()
  const [shownLink, setShownLink] = useState<{ link: OneTimeLinkResponse; name: string } | null>(null)

  if (me.data && me.data.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Alert>
          <ShieldAlert />
          <AlertTitle>Admins only</AlertTitle>
          <AlertDescription>Only workspace admins can manage the team.</AlertDescription>
        </Alert>
      </div>
    )
  }

  function change(member: TeamMember, changes: UpdateMemberRequest, done: string) {
    update.mutate(
      { userId: member.id, changes },
      { onSuccess: () => toast.success(done), onError: (error) => toast.error(error.message) },
    )
  }

  function createLink(member: TeamMember) {
    issueLink.mutate(member.id, {
      onSuccess: (link) => setShownLink({ link, name: member.name }),
      onError: (error) => toast.error(error.message),
    })
  }

  const members = team.data?.items ?? []
  const unlinked = members.filter((m) => m.active && !m.linkedTo).length

  return (
    <div className="mx-auto flex flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Who can sign in to this workspace, their oneix role, and the Zendesk user each account acts as.
          </p>
        </div>
        <InviteDialog onInvited={(link, name) => link && setShownLink({ link, name })} />
      </div>

      {unlinked > 0 && (
        <Alert>
          <Link2 />
          <AlertTitle>
            {unlinked} {unlinked === 1 ? "person isn't" : "people aren't"} linked to a Zendesk user
          </AlertTitle>
          <AlertDescription>
            They can sign in and read tickets, but can&apos;t reply or change tickets until their account is linked.
          </AlertDescription>
        </Alert>
      )}

      <Card className="py-0">
        <Table className="table-fixed" style={{ minWidth: 1100 }}>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Person</TableHead>
              <TableHead style={{ width: 110 }}>Account</TableHead>
              <TableHead style={{ width: 150 }}>oneix role</TableHead>
              <TableHead style={{ width: 320 }}>Zendesk user</TableHead>
              <TableHead style={{ width: 90 }}>Access</TableHead>
              <TableHead style={{ width: 120 }}>Last sign-in</TableHead>
              <TableHead style={{ width: 56 }} className="pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.isPending &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="px-4">
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {members.map((member) => {
              const isMe = member.id === me.data?.id
              const badge = accountBadges[member.account]
              return (
                <TableRow key={member.id} className={member.active ? undefined : "opacity-60"}>
                  <TableCell className="truncate pl-4">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium" title={member.name}>
                        {member.name}
                        {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground" title={member.email}>
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      disabled={isMe || update.isPending}
                      onValueChange={(role) =>
                        change(member, { role: role as UserRole }, `${member.name} is now ${role === "admin" ? "an admin" : "an agent"}`)
                      }
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label={`oneix role of ${member.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <ZendeskUserSelect
                        directory={directory.data?.items ?? []}
                        value={member.linkedTo?.externalId ?? null}
                        memberId={member.id}
                        disabled={directory.isPending || update.isPending}
                        onChange={(externalId) =>
                          change(
                            member,
                            { zendeskUserId: externalId },
                            externalId ? `${member.name} is linked` : `${member.name} is unlinked`,
                          )
                        }
                      />
                      {member.linkedTo && (
                        <span className="flex flex-wrap gap-1">
                          {member.linkedTo.roles.map((role) => (
                            <RoleBadge key={role} role={role} />
                          ))}
                        </span>
                      )}
                      {member.suggestedLink && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto justify-start p-0 text-xs"
                          onClick={() =>
                            change(member, { zendeskUserId: member.suggestedLink!.externalId }, `${member.name} is linked`)
                          }
                        >
                          Link to {member.suggestedLink.name} (same email)
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={member.active}
                      disabled={isMe || update.isPending}
                      onCheckedChange={(active) =>
                        change(
                          member,
                          { active },
                          active ? `${member.name} can sign in again` : `${member.name} no longer has access`,
                        )
                      }
                      aria-label={`Access for ${member.name}`}
                    />
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {member.lastLoginAt ? timeAgo(member.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${member.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={member.account === "disabled"}
                          onSelect={() => createLink(member)}
                        >
                          <KeyRound />
                          {member.account === "invited" ? "Create invite link" : "Create password reset link"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <LinkDialog link={shownLink?.link ?? null} personName={shownLink?.name ?? ""} onClose={() => setShownLink(null)} />
    </div>
  )
}
