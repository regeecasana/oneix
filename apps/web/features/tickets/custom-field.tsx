"use client"

import {
  type CustomFieldDefinition,
  type CustomFieldValue,
  optionLabel,
  READ_ONLY_FIELD_TYPES,
} from "@oneix/contracts"
import { SearchableMultiSelect, SearchableSelect } from "@/components/searchable-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface CustomFieldProps {
  field: CustomFieldDefinition
  value: CustomFieldValue
  onChange: (value: CustomFieldValue) => void
  /** Needs a value at the ticket's current status. */
  required: boolean
  requiredToSolve: boolean
  /** Why the value can't be saved, shown under the field. */
  error?: string
  disabled?: boolean
}

/** One custom field with the input its type needs. Fields agents can't edit show their value as text. */
export function CustomField({ field, value, onChange, required, requiredToSolve, error, disabled }: CustomFieldProps) {
  const id = `field-${field.id}`
  const readOnly = !field.editable || READ_ONLY_FIELD_TYPES.includes(field.type)
  const invalid = error !== undefined
  // Some fields repeat their title as the description; that adds nothing.
  const description = field.description?.trim() === field.title.trim() ? null : field.description
  const hint = <FieldHint error={error} requiredToSolve={requiredToSolve && !required} description={description} />

  if (field.type === "checkbox") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            disabled={disabled || readOnly}
            aria-invalid={invalid}
            className="mt-0.5"
          />
          <Label htmlFor={id} className="leading-snug font-normal">
            {field.title}
            {required && <RequiredMark />}
          </Label>
        </div>
        {hint}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {field.title}
        {required && <RequiredMark />}
      </Label>
      {readOnly ? (
        <p id={id} className="text-sm wrap-break-word">
          {displayValue(field, value) || <span className="text-muted-foreground">—</span>}
        </p>
      ) : (
        <FieldInput id={id} field={field} value={value} onChange={onChange} disabled={disabled} invalid={invalid} />
      )}
      {hint}
    </div>
  )
}

function FieldInput({
  id,
  field,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string
  field: CustomFieldDefinition
  value: CustomFieldValue
  onChange: (value: CustomFieldValue) => void
  disabled?: boolean
  invalid: boolean
}) {
  const text = value === null || typeof value === "boolean" || Array.isArray(value) ? "" : String(value)
  const options = field.options.map((o) => ({ value: o.value, label: optionLabel(o.name) }))

  switch (field.type) {
    case "dropdown":
      return (
        <SearchableSelect
          id={id}
          options={options}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
          clearLabel="-"
          placeholder="-"
          searchPlaceholder={`Search ${field.title}`}
          disabled={disabled}
          aria-invalid={invalid}
        />
      )
    case "multiselect":
      return (
        <SearchableMultiSelect
          id={id}
          options={options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          placeholder="-"
          searchPlaceholder={`Search ${field.title}`}
          disabled={disabled}
          aria-invalid={invalid}
        />
      )
    case "textarea":
      return (
        <Textarea
          id={id}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          disabled={disabled}
          aria-invalid={invalid}
        />
      )
    default:
      return (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "integer" ? "numeric" : field.type === "decimal" ? "decimal" : undefined}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={invalid}
        />
      )
  }
}

function FieldHint({
  error,
  requiredToSolve,
  description,
}: {
  error?: string
  requiredToSolve: boolean
  description: string | null
}) {
  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (!requiredToSolve && !description) return null
  return (
    <p className="line-clamp-2 text-xs text-muted-foreground" title={description ?? undefined}>
      {requiredToSolve && "Required to solve"}
      {requiredToSolve && description && " · "}
      {description}
    </p>
  )
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-label="required">
      *
    </span>
  )
}

/** A value as text, for fields shown read-only. */
function displayValue(field: CustomFieldDefinition, value: CustomFieldValue): string {
  if (value === null) return ""
  const name = (v: string) => optionLabel(field.options.find((o) => o.value === v)?.name ?? v)
  if (Array.isArray(value)) return value.map(name).join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (field.type === "dropdown") return name(String(value))
  return String(value)
}
