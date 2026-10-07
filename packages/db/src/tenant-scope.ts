import type { PrismaClient } from "./generated/prisma/client.js";

/** Models whose rows belong to exactly one tenant. */
export const TENANT_MODELS = new Set([
  "TenantConnection",
  "TenantMembership",
  "Customer",
  "Ticket",
  "WebhookEvent",
  "AuditLog",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown };

/**
 * Adds the tenant to a query's filter and new rows. Throws when a query names another tenant.
 * Exported for tests; use `scopedToTenant` in application code.
 */
export function scopeArgs(model: string | undefined, operation: string, args: Args, tenantId: string): Args {
  if (!model || !TENANT_MODELS.has(model)) return args;

  const scoped: Args = { ...args };
  const withTenant = (data: unknown): Record<string, unknown> => {
    const row = (data ?? {}) as Record<string, unknown>;
    if (row.tenantId !== undefined && row.tenantId !== tenantId) {
      throw new TenantScopeError(`${model}.${operation} tried to write to another tenant`);
    }
    return { ...row, tenantId };
  };

  if (WHERE_OPERATIONS.has(operation) || operation === "upsert") {
    const where = args.where ?? {};
    if (where.tenantId !== undefined && where.tenantId !== tenantId) {
      throw new TenantScopeError(`${model}.${operation} tried to read another tenant`);
    }
    scoped.where = { ...where, tenantId };
  }

  if (operation === "create") scoped.data = withTenant(args.data);
  if (operation === "createMany" || operation === "createManyAndReturn") {
    scoped.data = Array.isArray(args.data) ? args.data.map(withTenant) : withTenant(args.data);
  }
  if (operation === "upsert") scoped.create = withTenant(args.create);

  return scoped;
}

/**
 * A database client that only sees one tenant's rows.
 *
 * Every query on a tenant-owned model is filtered by the tenant, and new rows get it automatically,
 * so a forgotten `where: { tenantId }` cannot leak another client's data.
 * Nested writes through relations are not rewritten; write tenant-owned rows directly.
 */
export function scopedToTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Args, tenantId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof scopedToTenant>;
