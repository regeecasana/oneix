import { Inject, Injectable } from "@nestjs/common";
import {
  type CustomFieldDefinition,
  type CustomFieldOption,
  type CustomFieldType,
  type FormCondition,
  formsForBrand,
  type TicketFormDefinition,
  type TicketFormsResponse,
  type TicketStatus,
} from "@oneix/contracts";
import { type PrismaClient, scopedToTenant, type TicketField, type TicketForm } from "@oneix/db";
import { syncTicketForms, type TicketingRegistry } from "@oneix/tenancy";
import type { SessionUser } from "../../common/auth.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";

/** A ticket form with its custom fields, for checking a ticket against it. */
export interface FormDefinitions {
  /** Undefined when the backend has no forms. */
  form: TicketFormDefinition | undefined;
  fieldsById: Map<string, CustomFieldDefinition>;
}

/** Ticket forms and custom fields, from the copy the worker keeps in sync. */
@Injectable()
export class TicketFormsService {
  /** Tenants whose forms were synced on demand by this process, so it happens once. */
  private readonly synced = new Set<string>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly registry: TicketingRegistry,
  ) {}

  /**
   * The forms a ticket of this brand can use, its current form, and the default form, with the
   * fields they show. Sending every form at once would be large: accounts have hundreds of fields.
   */
  async forBrand(user: SessionUser, brandId: string | null, formId?: string): Promise<TicketFormsResponse> {
    const all = await this.forms(user.tenantId);
    const fallback = all.find((f) => f.isDefault && f.active);
    const forms = formsForBrand(all, brandId, formId ?? fallback?.id).filter(
      (f) => f.active || f.id === formId || f.id === fallback?.id,
    );
    if (fallback && !forms.includes(fallback)) forms.push(fallback);

    const fields = await this.fields(user.tenantId, forms.flatMap((f) => f.fieldIds));
    return { forms: forms.map((f) => onlyKnownFields(f, fields)), fields: [...fields.values()] };
  }

  /** A form (or the default when `formId` is null) with its fields. */
  async definitions(tenantId: string, formId: string | null): Promise<FormDefinitions> {
    const all = await this.forms(tenantId);
    const form = all.find((f) => f.id === formId) ?? all.find((f) => f.isDefault && f.active);
    if (!form) return { form: undefined, fieldsById: new Map() };
    const fieldsById = await this.fields(tenantId, form.fieldIds);
    return { form: onlyKnownFields(form, fieldsById), fieldsById };
  }

  private async forms(tenantId: string): Promise<TicketFormDefinition[]> {
    const db = scopedToTenant(this.prisma, tenantId);
    let rows = await db.ticketForm.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
    // A tenant connected before forms were synced gets them the first time they're needed.
    if (rows.length === 0 && !this.synced.has(tenantId)) {
      this.synced.add(tenantId);
      await syncTicketForms(this.prisma, tenantId, await this.registry.for(tenantId));
      rows = await db.ticketForm.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
    }
    return rows.map(toFormDefinition);
  }

  private async fields(tenantId: string, ids: string[]): Promise<Map<string, CustomFieldDefinition>> {
    const rows = await scopedToTenant(this.prisma, tenantId).ticketField.findMany({
      where: { active: true, externalId: { in: [...new Set(ids)] } },
    });
    return new Map(rows.map((row) => [row.externalId, toFieldDefinition(row)]));
  }
}

/** Keeps only the form's custom fields: its field list also names built-in fields such as status. */
function onlyKnownFields(form: TicketFormDefinition, fields: Map<string, CustomFieldDefinition>): TicketFormDefinition {
  return { ...form, fieldIds: form.fieldIds.filter((id) => fields.has(id)) };
}

function toFormDefinition(row: TicketForm): TicketFormDefinition {
  return {
    id: row.externalId,
    name: row.name,
    isDefault: row.isDefault,
    active: row.active,
    brandIds: row.inAllBrands ? null : row.brandExternalIds,
    fieldIds: row.fieldExternalIds,
    conditions: row.conditions as unknown as FormCondition[],
  };
}

function toFieldDefinition(row: TicketField): CustomFieldDefinition {
  return {
    id: row.externalId,
    type: row.type as CustomFieldType,
    title: row.title,
    description: row.description,
    requiredOn: row.requiredOn as TicketStatus[],
    editable: row.editable,
    options: row.options as unknown as CustomFieldOption[],
    pattern: row.pattern,
  };
}
