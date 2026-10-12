"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

interface BaseProps {
  id?: string
  options: SelectOption[]
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  "aria-invalid"?: boolean
}

/**
 * A select with a search box, for long lists. The list has a fixed height and scrolls.
 * With `clearLabel`, the first item clears the value.
 */
export function SearchableSelect({
  value,
  onChange,
  clearLabel,
  ...props
}: BaseProps & {
  value: string | null
  onChange: (value: string | null) => void
  clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = props.options.find((o) => o.value === value)

  function pick(next: string | null) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <Picker {...props} open={open} onOpenChange={setOpen} label={selected?.label}>
      {clearLabel && (
        <CommandItem value={`\u0000${clearLabel}`} onSelect={() => pick(null)} className="text-muted-foreground">
          {clearLabel}
        </CommandItem>
      )}
      {props.options.map((option) => (
        <CommandItem
          key={option.value}
          // What the search matches; the value keeps options with the same label apart.
          value={`${option.label}\u0000${option.value}`}
          data-checked={option.value === value}
          onSelect={() => pick(option.value)}
        >
          <span className="min-w-0 flex-1 wrap-break-word">{option.label}</span>
        </CommandItem>
      ))}
    </Picker>
  )
}

/** A multi-select with a search box. The list stays open while picking. */
export function SearchableMultiSelect({
  value,
  onChange,
  ...props
}: BaseProps & {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const labels = props.options.filter((o) => value.includes(o.value)).map((o) => o.label)

  return (
    <Picker {...props} open={open} onOpenChange={setOpen} label={labels.length > 0 ? labels.join(", ") : undefined}>
      {props.options.map((option) => {
        const checked = value.includes(option.value)
        return (
          <CommandItem
            key={option.value}
            value={`${option.label}\u0000${option.value}`}
            onSelect={() => onChange(checked ? value.filter((v) => v !== option.value) : [...value, option.value])}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                checked && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {checked && <Check className="size-3" />}
            </span>
            <span className="min-w-0 flex-1 wrap-break-word">{option.label}</span>
          </CommandItem>
        )
      })}
    </Picker>
  )
}

function Picker({
  id,
  disabled,
  placeholder = "Select…",
  searchPlaceholder = "Search",
  open,
  onOpenChange,
  label,
  children,
  "aria-invalid": invalid,
}: BaseProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string | undefined
  children: React.ReactNode
}) {
  return (
    // Modal so the list scrolls with the wheel, also inside dialogs.
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !label && "text-muted-foreground")}>{label ?? placeholder}</span>
          <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>{children}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
