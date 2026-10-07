import type { PrismaClient } from "@oneix/db";
import { ZendeskProvider } from "@oneix/ticketing";
import { authTypeOf, type ZendeskCredentials, zendeskConfig } from "./credentials.js";
import { type AgentSyncResult, syncAgents } from "./provisioning.js";
import type { SecretBox } from "./secret-box.js";

export interface ConnectTenantInput {
  /** URL-safe tenant name, used in webhook URLs and sign-in. */
  slug: string;
  /** Display name. Defaults to the slug for a new tenant; an existing tenant keeps its name. */
  name?: string;
  subdomain: string;
  credentials: ZendeskCredentials;
  webhookSecret?: string;
  impersonate?: boolean;
}

export interface ConnectTenantResult {
  tenantId: string;
  created: boolean;
  connectedAs: { name: string; email: string | null };
  agents: AgentSyncResult;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Creates or updates a tenant and its Zendesk connection.
 *
 * The credentials are checked first: they must work and belong to a Zendesk admin, because the
 * backfill and agent sync need admin access. Then the agents are provisioned. Safe to run again,
 * for example to rotate credentials.
 */
export async function connectTenant(
  prisma: PrismaClient,
  secrets: SecretBox,
  input: ConnectTenantInput,
): Promise<ConnectTenantResult> {
  if (!SLUG.test(input.slug)) {
    throw new Error("Slug must be lowercase letters, numbers, and dashes, up to 50 characters");
  }
  if (!SUBDOMAIN.test(input.subdomain)) {
    throw new Error("Subdomain must be the part before .zendesk.com, for example `acme`");
  }

  const impersonate = input.impersonate ?? false;
  const ticketing = new ZendeskProvider(zendeskConfig(input.subdomain, input.credentials, impersonate));
  const me = await ticketing.getCurrentUser();
  if (me.role !== "admin") {
    throw new Error(`The credentials belong to ${me.email ?? me.name}, who is not a Zendesk admin`);
  }

  const existing = await prisma.tenant.findUnique({ where: { slug: input.slug }, select: { id: true } });
  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    create: { slug: input.slug, name: input.name ?? input.slug },
    update: input.name ? { name: input.name } : {},
    select: { id: true },
  });

  const connection = {
    subdomain: input.subdomain.toLowerCase(),
    authType: authTypeOf(input.credentials),
    credentials: secrets.encryptJson(input.credentials),
    impersonate,
    status: "active" as const,
    lastError: null,
    lastCheckedAt: new Date(),
    // Leaving the secret out keeps the stored one; webhooks are often set up after onboarding.
    ...(input.webhookSecret ? { webhookSecret: secrets.encrypt(input.webhookSecret) } : {}),
  };
  await prisma.tenantConnection.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "zendesk" } },
    create: { tenantId: tenant.id, provider: "zendesk", ...connection },
    update: connection,
  });

  const agents = await syncAgents(prisma, tenant.id, ticketing);
  return { tenantId: tenant.id, created: !existing, connectedAs: { name: me.name, email: me.email }, agents };
}
