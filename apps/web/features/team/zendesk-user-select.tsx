"use client"

import type { BackendDirectoryResponse } from "@oneix/contracts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Select items can't have an empty value, so "not linked" has a name. */
export const NOT_LINKED = "none"

/**
 * Picks the Zendesk user an account is linked to, from the workspace's directory.
 * Users already linked to another account can't be picked.
 */
export function ZendeskUserSelect({
  directory,
  value,
  memberId,
  onChange,
  disabled,
  id,
}: {
  directory: BackendDirectoryResponse["items"]
  value: string | null
  /** The account being linked; its own current link stays selectable. */
  memberId?: string
  onChange: (externalId: string | null) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <Select
      value={value ?? NOT_LINKED}
      onValueChange={(next) => onChange(next === NOT_LINKED ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-label="Zendesk user">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NOT_LINKED}>Not linked</SelectItem>
        {directory.map((user) => {
          const takenByOther = user.linkedToMemberId !== null && user.linkedToMemberId !== memberId
          return (
            <SelectItem key={user.externalId} value={user.externalId} disabled={takenByOther || !user.active}>
              <span className="truncate">
                {user.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {user.roles.join(", ")}
                  {user.email ? ` · ${user.email}` : ""}
                  {takenByOther ? " · linked" : !user.active ? " · suspended" : ""}
                </span>
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
