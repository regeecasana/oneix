"use client"

import type { BackendDirectoryResponse } from "@oneix/contracts"
import { ChevronsUpDown, Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** The value for "not linked" in the list. */
export const NOT_LINKED = "none"
/** The option that creates a new Zendesk agent instead of linking an existing one. */
export const CREATE_NEW = "create-new"

/**
 * Picks the Zendesk user an account is linked to, from the workspace's directory, searchable by
 * name, email, or role. Users already linked to another account can't be picked. In the open list
 * each user shows their name, roles, email, and status stacked; the closed picker shows just the name.
 */
export function ZendeskUserSelect({
  directory,
  value,
  memberId,
  onChange,
  disabled,
  id,
  allowCreate = false,
}: {
  directory: BackendDirectoryResponse["items"]
  /** A Zendesk user ID, null for not linked, or CREATE_NEW. */
  value: string | null
  /** The account being linked; its own current link stays selectable. */
  memberId?: string
  onChange: (value: string | null) => void
  disabled?: boolean
  id?: string
  /** Offers "Create a new Zendesk agent", for invites. */
  allowCreate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = directory.find((user) => user.externalId === value)
  const label = value === CREATE_NEW ? "New Zendesk agent" : (selected?.name ?? "Not linked")

  function pick(next: string | null) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    // Modal so the list scrolls with the wheel inside a dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Zendesk user"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandInput placeholder="Search name, email, or role" />
          <CommandList className="h-80 max-h-80">
            <CommandEmpty>No Zendesk user matches.</CommandEmpty>
            {allowCreate && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="create a new zendesk agent"
                    data-checked={value === CREATE_NEW}
                    onSelect={() => pick(CREATE_NEW)}
                  >
                    <Plus />
                    <span className="flex flex-col items-start">
                      <span className="font-medium">Create a new Zendesk agent</span>
                      <span className="text-xs text-muted-foreground">For someone who isn&apos;t in Zendesk yet</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              <CommandItem value="not linked" data-checked={value === null} onSelect={() => pick(null)}>
                Not linked
              </CommandItem>
              {directory.map((user) => {
                const takenByOther = user.linkedToMemberId !== null && user.linkedToMemberId !== memberId
                return (
                  <CommandItem
                    key={user.externalId}
                    // What the search matches; the ID keeps two people with the same name apart.
                    value={`${user.name} ${user.email ?? ""} ${user.roles.join(" ")} ${user.externalId}`}
                    disabled={takenByOther || !user.active}
                    data-checked={user.externalId === value}
                    onSelect={() => pick(user.externalId)}
                  >
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.roles.join(", ")}</span>
                      {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
                      {takenByOther && <span className="text-xs text-muted-foreground">Linked to another account</span>}
                      {!takenByOther && !user.active && <span className="text-xs text-muted-foreground">Suspended</span>}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
