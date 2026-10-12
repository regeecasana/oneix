import type { PrismaClient } from "@oneix/db";
import type { TicketingProvider } from "@oneix/ticketing";

export interface TicketFormSyncResult {
  /** Active forms after the sync. */
  forms: number;
  /** Active custom fields after the sync. */
  fields: number;
}

/**
 * Copies the tenant's ticket forms and custom fields from the backend, so tickets show their form
 * without a backend call. The backend doesn't announce changes to them, so this runs on a
 * schedule. Forms and fields removed in the backend are kept, marked inactive, because old
 * tickets may still use them.
 */
export async function syncTicketForms(
  prisma: PrismaClient,
  tenantId: string,
  ticketing: TicketingProvider,
): Promise<TicketFormSyncResult> {
  const [forms, fields] = await Promise.all([ticketing.listTicketForms(), ticketing.listTicketFields()]);
  const syncedAt = new Date();

  for (const field of fields) {
    const data = {
      type: field.type,
      title: field.title,
      description: field.description,
      position: field.position,
      active: field.active,
      requiredOn: field.requiredOn,
      editable: field.editable,
      options: field.options,
      pattern: field.pattern,
      syncedAt,
    };
    await prisma.ticketField.upsert({
      where: { tenantId_externalId: { tenantId, externalId: field.id } },
      create: { tenantId, externalId: field.id, ...data },
      update: data,
    });
  }

  for (const form of forms) {
    const data = {
      name: form.name,
      position: form.position,
      active: form.active,
      isDefault: form.isDefault,
      inAllBrands: form.brandIds === null,
      brandExternalIds: form.brandIds ?? [],
      fieldExternalIds: form.fieldIds,
      conditions: form.conditions,
      syncedAt,
    };
    await prisma.ticketForm.upsert({
      where: { tenantId_externalId: { tenantId, externalId: form.id } },
      create: { tenantId, externalId: form.id, ...data },
      update: data,
    });
  }

  await prisma.ticketField.updateMany({
    where: { tenantId, externalId: { notIn: fields.map((f) => f.id) }, active: true },
    data: { active: false, syncedAt },
  });
  await prisma.ticketForm.updateMany({
    where: { tenantId, externalId: { notIn: forms.map((f) => f.id) }, active: true },
    data: { active: false, isDefault: false, syncedAt },
  });

  return { forms: forms.filter((f) => f.active).length, fields: fields.filter((f) => f.active).length };
}
