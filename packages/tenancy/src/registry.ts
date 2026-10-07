import type { ConnectionStatus, PrismaClient } from "@oneix/db";
import { type TicketingProvider, ZendeskProvider } from "@oneix/ticketing";
import { type ZendeskCredentials, zendeskConfig } from "./credentials.js";
import type { SecretBox } from "./secret-box.js";

/** The tenant has no usable ticketing connection: none set up, or disabled. */
export class TenantNotConnectedError extends Error {
  constructor(readonly tenantId: string) {
    super(`Tenant ${tenantId} has no active ticketing connection`);
    this.name = "TenantNotConnectedError";
  }
}

interface Entry {
  provider: TicketingProvider;
  connectionUpdatedAt: number;
  checkedAt: number;
}

/** How long a tenant's client is reused before the connection row is checked for changes. */
const RECHECK_MS = 30_000;

/**
 * Hands out one ticketing client per tenant, built from the tenant's stored connection.
 * Clients are reused, so OAuth tokens are cached per tenant, and rebuilt when the connection changes.
 */
export class TicketingRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: SecretBox,
  ) {}

  async for(tenantId: string): Promise<TicketingProvider> {
    const cached = this.entries.get(tenantId);
    const now = Date.now();
    if (cached && now - cached.checkedAt < RECHECK_MS) return cached.provider;

    const connection = await this.prisma.tenantConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: "zendesk" } },
    });
    if (!connection || connection.status === "disabled") {
      this.entries.delete(tenantId);
      throw new TenantNotConnectedError(tenantId);
    }

    const updatedAt = connection.updatedAt.getTime();
    if (cached && cached.connectionUpdatedAt === updatedAt) {
      cached.checkedAt = now;
      return cached.provider;
    }

    const credentials = this.secrets.decryptJson<ZendeskCredentials>(connection.credentials);
    const provider = new ZendeskProvider(zendeskConfig(connection.subdomain, credentials, connection.impersonate));
    this.entries.set(tenantId, { provider, connectionUpdatedAt: updatedAt, checkedAt: now });
    return provider;
  }

  /** Records whether the tenant's backend is reachable, for operations to see in `tenant list`. */
  async reportStatus(tenantId: string, status: Exclude<ConnectionStatus, "disabled">, error?: string): Promise<void> {
    await this.prisma.tenantConnection.updateMany({
      where: { tenantId, provider: "zendesk", status: { not: "disabled" } },
      data: { status, lastError: error?.slice(0, 2000) ?? null, lastCheckedAt: new Date() },
    });
  }

  /** The webhook signing secret for a tenant, or null when none is set. */
  async webhookSecret(tenantId: string): Promise<string | null> {
    const connection = await this.prisma.tenantConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: "zendesk" } },
      select: { webhookSecret: true, status: true },
    });
    if (!connection?.webhookSecret || connection.status === "disabled") return null;
    return this.secrets.decrypt(connection.webhookSecret);
  }
}
