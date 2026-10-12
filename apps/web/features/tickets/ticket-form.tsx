"use client"

import {
  type CustomFieldValue,
  type CustomFieldValues,
  formOfTicket,
  invalidFieldValue,
  isEmptyValue,
  shownFields,
  type StatusBlocker,
  statusBlockers,
  type TicketDetail,
} from "@oneix/contracts"
import { useState } from "react"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/searchable-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { CustomField } from "./custom-field"
import { useTicketForms, useUpdateTicket } from "./queries"

/** Unsaved edits: the chosen form and every field's value. */
interface Draft {
  formId: string | null
  values: CustomFieldValues
}

/**
 * The ticket's form and its custom fields, as in Zendesk: fields show and become required as other
 * fields change. Edits are kept until saved, then written to the backend in one update.
 */
export function TicketForm({ ticket, readOnly = false }: { ticket: TicketDetail; readOnly?: boolean }) {
  const forms = useTicketForms(ticket.brandId, ticket.formId)
  const update = useUpdateTicket(ticket.number)
  const [draft, setDraft] = useState<Draft | null>(null)
  const disabled = readOnly || ticket.status === "closed" || update.isPending

  if (forms.isPending) {
    return (
      <FormCard pending={false}>
        <Skeleton className="h-24 w-full" />
      </FormCard>
    )
  }
  if (forms.isError) {
    return (
      <FormCard pending={false}>
        <Alert variant="destructive">
          <AlertDescription>{forms.error.message}</AlertDescription>
        </Alert>
      </FormCard>
    )
  }

  const fieldsById = new Map(forms.data.fields.map((f) => [f.id, f]))
  const savedForm = formOfTicket(forms.data.forms, ticket.formId)
  const form = formOfTicket(forms.data.forms, draft ? draft.formId : ticket.formId)
  if (!form) {
    return (
      <FormCard pending={false}>
        <p className="text-sm text-muted-foreground">This workspace has no ticket forms.</p>
      </FormCard>
    )
  }

  const values = draft?.values ?? ticket.customFields
  const changedFields = draft
    ? [...new Set([...Object.keys(draft.values), ...Object.keys(ticket.customFields)])].filter(
        (id) => !sameValue(draft.values[id], ticket.customFields[id]),
      )
    : []
  const formChanged = draft !== null && form.id !== savedForm?.id
  const dirty = formChanged || changedFields.length > 0

  // The same checks the API makes, so problems show before saving.
  const errors = new Map<string, string>()
  for (const id of changedFields) {
    const field = fieldsById.get(id)
    const problem = field && invalidFieldValue(field, cleaned(values[id]))
    if (problem) errors.set(id, `${field.title} ${problem}`)
  }
  const existing = new Set(
    savedForm ? statusBlockers(savedForm, fieldsById, ticket.customFields, ticket.status).map(blockerKey) : [],
  )
  const blockers = dirty
    ? statusBlockers(form, fieldsById, compact(values), ticket.status).filter((b) => !existing.has(blockerKey(b)))
    : []
  for (const blocker of blockers) if (!errors.has(blocker.fieldId)) errors.set(blocker.fieldId, blocker.message)

  const formOptions = forms.data.forms
    .filter((f) => f.active || f.id === form.id)
    .map((f) => ({ value: f.id, label: f.name }))

  function edit(next: Partial<Draft>) {
    setDraft((current) => ({
      formId: current?.formId ?? ticket.formId,
      values: current?.values ?? ticket.customFields,
      ...next,
    }))
  }

  function save() {
    const customFields = Object.fromEntries(changedFields.map((id) => [id, cleaned(values[id])]))
    update.mutate(
      {
        ...(formChanged ? { formId: form!.id } : {}),
        ...(changedFields.length > 0 ? { customFields } : {}),
      },
      {
        onSuccess: () => {
          setDraft(null)
          toast.success("Ticket form saved")
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <FormCard pending={update.isPending}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-form" className="text-xs text-muted-foreground">
          Form
        </Label>
        <SearchableSelect
          id="ticket-form"
          options={formOptions}
          value={form.id}
          onChange={(formId) => formId && edit({ formId })}
          searchPlaceholder="Search forms"
          disabled={disabled}
        />
      </div>

      {shownFields(form, fieldsById, values, ticket.status).map(({ field, required, requiredToSolve }) => (
        <CustomField
          key={field.id}
          field={field}
          value={values[field.id] ?? null}
          onChange={(value) => edit({ values: { ...values, [field.id]: value } })}
          required={required}
          requiredToSolve={requiredToSolve}
          error={errors.get(field.id)}
          disabled={disabled}
        />
      ))}

      {dirty && (
        <div className="sticky bottom-0 -mx-1 flex items-center gap-2 bg-card px-1 pt-2 pb-1">
          <Button size="sm" onClick={save} disabled={disabled || errors.size > 0}>
            {update.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={update.isPending}>
            Discard
          </Button>
          {errors.size > 0 && (
            <span className="text-xs text-destructive">
              {errors.size === 1 ? "1 field needs attention" : `${errors.size} fields need attention`}
            </span>
          )}
        </div>
      )}
    </FormCard>
  )
}

function FormCard({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    // Visible overflow, so the save bar can stick to the bottom of the screen while the card is taller.
    <Card size="sm" className="overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Ticket form
          {pending && <Spinner className="size-3.5 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

/** Empty text and empty multi-selects are saved as no value. */
function cleaned(value: CustomFieldValue | undefined): CustomFieldValue {
  return value === undefined || (isEmptyValue(value) && value !== false) ? null : value
}

/** Values without the empty ones, as the ticket stores them. */
function compact(values: CustomFieldValues): CustomFieldValues {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmptyValue(v)))
}

function sameValue(a: CustomFieldValue | undefined, b: CustomFieldValue | undefined): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function blockerKey(blocker: StatusBlocker): string {
  return `${blocker.fieldId}:${blocker.message}`
}
