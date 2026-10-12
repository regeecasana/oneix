import { z } from "zod";
import { type CustomFieldValue, type CustomFieldValues, TicketStatus } from "./tickets.js";

/**
 * Ticket forms and custom fields. A ticket uses one form; the form decides which custom fields
 * show, in what order, and, through its conditions, which fields appear and are required
 * depending on other fields' values. The rules here are shared by the API (which enforces them)
 * and the web app (which shows them).
 */

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "integer",
  "decimal",
  "date",
  "checkbox",
  /** Text that must match a pattern. */
  "regexp",
  "dropdown",
  "multiselect",
  /** A link to another record, such as a user or organization. Shown read-only. */
  "lookup",
  /** A masked card number. Shown read-only. */
  "credit_card",
] as const;
export const CustomFieldType = z.enum(CUSTOM_FIELD_TYPES);
export type CustomFieldType = z.infer<typeof CustomFieldType>;

/** Field types oneix can't edit; their values are shown as they are. */
export const READ_ONLY_FIELD_TYPES: readonly CustomFieldType[] = ["lookup", "credit_card"];

export const CustomFieldOption = z.object({
  /** Shown to agents. Nested options use "::" between levels, as in "Phones::Android". */
  name: z.string(),
  /** Stored on the ticket. */
  value: z.string(),
  /** False when a ticket with this option selected can't be solved. */
  allowSolving: z.boolean(),
});
export type CustomFieldOption = z.infer<typeof CustomFieldOption>;

export const CustomFieldDefinition = z.object({
  id: z.string(),
  type: CustomFieldType,
  title: z.string(),
  /** Help text for agents. */
  description: z.string().nullable(),
  /** Statuses at which the field needs a value on every form, such as "required to solve". */
  requiredOn: z.array(TicketStatus),
  /** False when agents may see but not change the field. */
  editable: z.boolean(),
  /** Choices for dropdowns and multi-selects, in order. */
  options: z.array(CustomFieldOption),
  /** The pattern a `regexp` field's value must match. */
  pattern: z.string().nullable(),
});
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinition>;

/** When the parent field has this value, the children show; each may be required at some statuses. */
export const FormCondition = z.object({
  parentFieldId: z.string(),
  /** A dropdown option's value, or true or false for a checkbox. */
  value: z.union([z.string(), z.boolean()]),
  children: z.array(z.object({ fieldId: z.string(), requiredOn: z.array(TicketStatus) })),
});
export type FormCondition = z.infer<typeof FormCondition>;

export const TicketFormDefinition = z.object({
  id: z.string(),
  name: z.string(),
  /** The form tickets use when they have none. */
  isDefault: z.boolean(),
  /** Inactive forms only show on tickets that already use them. */
  active: z.boolean(),
  /** Brands that can use the form; null for every brand. */
  brandIds: z.array(z.string()).nullable(),
  /** The form's custom fields, in order. */
  fieldIds: z.array(z.string()),
  conditions: z.array(FormCondition),
});
export type TicketFormDefinition = z.infer<typeof TicketFormDefinition>;

export const TicketFormsQuery = z.object({
  brandId: z.string().min(1).optional().meta({ description: "The ticket's brand. Omit for every brand's forms." }),
  formId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: "The ticket's current form, included even when inactive or for another brand." }),
});
export type TicketFormsQuery = z.infer<typeof TicketFormsQuery>;

export const TicketFormsResponse = z.object({
  forms: z.array(TicketFormDefinition),
  /** Every active custom field used by a form. */
  fields: z.array(CustomFieldDefinition),
});
export type TicketFormsResponse = z.infer<typeof TicketFormsResponse>;

/** The form a ticket uses: its own, or the default when it has none or its form is gone. */
export function formOfTicket(
  forms: TicketFormDefinition[],
  formId: string | null,
): TicketFormDefinition | undefined {
  return forms.find((f) => f.id === formId) ?? forms.find((f) => f.isDefault && f.active);
}

/** Active forms a ticket of this brand can switch to, plus its current form. */
export function formsForBrand(
  forms: TicketFormDefinition[],
  brandId: string | null,
  currentFormId?: string,
): TicketFormDefinition[] {
  return forms.filter(
    (f) =>
      f.id === currentFormId ||
      (f.active && (f.brandIds === null || brandId === null || f.brandIds.includes(brandId))),
  );
}

export function isEmptyValue(value: CustomFieldValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === false ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

export interface ShownField {
  field: CustomFieldDefinition;
  /** Needs a value at the given status. */
  required: boolean;
  /** Needs a value to solve the ticket (and maybe earlier). */
  requiredToSolve: boolean;
}

/**
 * The fields a form shows for these values, in the form's order. A field controlled by conditions
 * shows only while one of them matches and that condition's parent field shows too.
 */
export function shownFields(
  form: TicketFormDefinition,
  fieldsById: Map<string, CustomFieldDefinition>,
  values: CustomFieldValues,
  status: TicketStatus,
): ShownField[] {
  const controlling = new Map<string, FormCondition[]>();
  for (const condition of form.conditions) {
    for (const child of condition.children) {
      controlling.set(child.fieldId, [...(controlling.get(child.fieldId) ?? []), condition]);
    }
  }

  const visibility = new Map<string, boolean>();
  const isShown = (fieldId: string, path: Set<string>): boolean => {
    const known = visibility.get(fieldId);
    if (known !== undefined) return known;
    const conditions = controlling.get(fieldId);
    if (!conditions) return true;
    if (path.has(fieldId)) return false; // A loop in the conditions: hide rather than spin.
    const next = new Set(path).add(fieldId);
    const shown = conditions.some((c) => parentShown(c.parentFieldId, next) && matches(c, values[c.parentFieldId]));
    visibility.set(fieldId, shown);
    return shown;
  };
  // A parent oneix doesn't know (a system field) counts as shown and matching, so nothing is hidden by mistake.
  const parentShown = (fieldId: string, path: Set<string>) => !fieldsById.has(fieldId) || isShown(fieldId, path);
  const matches = (condition: FormCondition, value: CustomFieldValue | undefined) => {
    if (!fieldsById.has(condition.parentFieldId)) return true;
    if (typeof condition.value === "boolean") return (value === true) === condition.value;
    return Array.isArray(value) ? value.includes(condition.value) : value === condition.value;
  };

  const shown: ShownField[] = [];
  for (const fieldId of form.fieldIds) {
    const field = fieldsById.get(fieldId);
    if (!field || !isShown(fieldId, new Set())) continue;
    const requiredOn = new Set(field.requiredOn);
    for (const condition of controlling.get(fieldId) ?? []) {
      if (!parentShown(condition.parentFieldId, new Set([fieldId])) || !matches(condition, values[condition.parentFieldId])) {
        continue;
      }
      for (const child of condition.children) {
        if (child.fieldId === fieldId) for (const s of child.requiredOn) requiredOn.add(s);
      }
    }
    shown.push({ field, required: requiredOn.has(status), requiredToSolve: requiredOn.has("solved") });
  }
  return shown;
}

export interface StatusBlocker {
  fieldId: string;
  message: string;
}

/**
 * What stops the ticket from being saved with this status: empty required fields, and dropdown
 * options that don't allow solving. Empty when nothing does.
 */
export function statusBlockers(
  form: TicketFormDefinition,
  fieldsById: Map<string, CustomFieldDefinition>,
  values: CustomFieldValues,
  status: TicketStatus,
): StatusBlocker[] {
  const problems: StatusBlocker[] = [];
  for (const { field, required } of shownFields(form, fieldsById, values, status)) {
    const value = values[field.id];
    if (required && isEmptyValue(value)) problems.push({ fieldId: field.id, message: `${field.title} is required` });
    if (status === "solved" && !isEmptyValue(value)) {
      const selected = Array.isArray(value) ? value : [value];
      for (const option of field.options) {
        if (!option.allowSolving && selected.includes(option.value)) {
          problems.push({
            fieldId: field.id,
            message: `${field.title}: "${optionLabel(option.name)}" doesn't allow solving`,
          });
        }
      }
    }
  }
  return problems;
}

/** Why a value doesn't fit the field, or null when it does. Null values (clearing) always fit. */
export function invalidFieldValue(field: CustomFieldDefinition, value: CustomFieldValue): string | null {
  if (value === null) return null;
  const optionValues = new Set(field.options.map((o) => o.value));
  const text = typeof value === "string" ? value : null;
  switch (field.type) {
    case "text":
    case "textarea":
      return text === null ? "must be text" : null;
    case "regexp":
      if (text === null) return "must be text";
      return patternMatches(field.pattern, text) ? null : "doesn't match the required format";
    case "integer":
      return /^-?\d+$/.test(String(value)) && typeof value !== "boolean" ? null : "must be a whole number";
    case "decimal":
      return /^-?\d+(\.\d+)?$/.test(String(value)) && typeof value !== "boolean" ? null : "must be a number";
    case "date":
      return text !== null && /^\d{4}-\d{2}-\d{2}$/.test(text) ? null : "must be a date (YYYY-MM-DD)";
    case "checkbox":
      return typeof value === "boolean" ? null : "must be true or false";
    case "dropdown":
      return text !== null && optionValues.has(text) ? null : "isn't one of the options";
    case "multiselect":
      return Array.isArray(value) && value.every((v) => optionValues.has(v)) ? null : "isn't one of the options";
    default:
      return "can't be changed in oneix";
  }
}

/** Patterns come from the backend and may use syntax JavaScript lacks; those aren't checked. */
function patternMatches(pattern: string | null, text: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return true;
  }
}

/** "Phones::Android" as "Phones › Android". */
export function optionLabel(name: string): string {
  return name.split("::").join(" › ");
}
