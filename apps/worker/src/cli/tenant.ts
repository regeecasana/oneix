/**
 * Tenant administration for oneix operations: `npm run tenant -- <command> [options]`.
 * Run `npm run tenant -- help` for usage.
 */
import { parseArgs } from "node:util";
import { QUEUES, redisConnectionFromUrl, TICKET_SYNC_JOBS } from "@oneix/contracts";
import { createPrismaClient, type PrismaClient } from "@oneix/db";
import {
  connectTenant,
  SecretBox,
  syncAgents,
  TicketingRegistry,
  type ZendeskCredentials,
  zendeskCredentialsFromEnv,
} from "@oneix/tenancy";
import { Queue } from "bullmq";
import { z } from "zod";

const USAGE = `Usage: npm run tenant -- <command> [options]

Commands
  add                 Create or update a tenant and connect its Zendesk. Verifies the credentials,
                      provisions the agents, and queues the first ticket import.
                        --slug <slug>              URL-safe name, e.g. acme (required)
                        --name <name>              Display name (defaults to the slug)
                        --subdomain <subdomain>    The part before .zendesk.com (required)
                        --email <email> --api-token <token>         API token of a Zendesk admin
                        --access-token <token>                      or an OAuth access token
                        --client-id <id> --client-secret <secret>   or an OAuth client
                        --webhook-secret <secret>  Signing secret of the tenant's Zendesk webhook
                        --impersonate              Act as agents with X-On-Behalf-Of (OAuth only)
                      Credentials not given as options are read from ZENDESK_* variables,
                      which keeps them out of your shell history.
  list                Show every tenant, its connection status, agents, and cached tickets.
  sync-agents         Provision agents from Zendesk now.          --slug <slug>
  set-webhook-secret  Store the Zendesk webhook signing secret.  --slug <slug> --secret <secret>
  disable / enable    Stop or resume all Zendesk traffic for a tenant.  --slug <slug>
  bootstrap           Development: connect the tenant in DEV_TENANT_SLUG from ZENDESK_* variables,
                      unless it is already connected. Used by npm start.
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" },
    name: { type: "string" },
    subdomain: { type: "string" },
    email: { type: "string" },
    "api-token": { type: "string" },
    "access-token": { type: "string" },
    "client-id": { type: "string" },
    "client-secret": { type: "string" },
    "webhook-secret": { type: "string" },
    secret: { type: "string" },
    impersonate: { type: "boolean" },
  },
});

const command = positionals[0] ?? "help";
if (command === "help") {
  console.log(USAGE);
  process.exit(0);
}

const parsedEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    ONEIX_ENCRYPTION_KEY: z.string().min(1),
  })
  .safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")));
if (!parsedEnv.success) {
  console.error(`
✖ Missing settings in .env:
${z.prettifyError(parsedEnv.error)}
`);
  process.exit(1);
}
const env = parsedEnv.data;

const prisma = createPrismaClient(env.DATABASE_URL);
const secrets = new SecretBox(env.ONEIX_ENCRYPTION_KEY);

try {
  await run(command);
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function run(command: string): Promise<void> {
  switch (command) {
    case "add":
      return add(required("slug"), required("subdomain"), credentialsFromOptions());
    case "bootstrap":
      return bootstrap();
    case "list":
      return list();
    case "sync-agents":
      return syncAgentsNow(required("slug"));
    case "set-webhook-secret":
      return setWebhookSecret(required("slug"), values.secret ?? required("webhook-secret"));
    case "disable":
    case "enable":
      return setEnabled(required("slug"), command === "enable");
    default:
      throw new Error(`Unknown command "${command}". Run: npm run tenant -- help`);
  }
}

async function add(slug: string, subdomain: string, credentials: ZendeskCredentials): Promise<void> {
  console.log(`Connecting tenant "${slug}" to ${subdomain}.zendesk.com…`);
  const result = await connectTenant(prisma, secrets, {
    slug,
    name: values.name,
    subdomain,
    credentials,
    webhookSecret: values["webhook-secret"],
    impersonate: values.impersonate ?? false,
  });
  await queueImport(result.tenantId);

  console.log(`✔ Tenant ${result.created ? "created" : "updated"}: ${slug}`);
  console.log(`  Connected as:  ${result.connectedAs.name} <${result.connectedAs.email ?? "no email"}>`);
  console.log(`  Agents:        ${result.agents.active} active, ${result.agents.deactivated} deactivated, ${result.agents.skipped} skipped`);
  console.log(`  Ticket import: queued; the worker imports in the background`);
  console.log(`  Webhook URL:   <api host>/webhooks/zendesk/${slug}/ticket-updated`);
}

async function bootstrap(): Promise<void> {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const credentials = zendeskCredentialsFromEnv(process.env);
  if (!subdomain || !credentials) {
    console.log("No ZENDESK_SUBDOMAIN and credentials set; skipping the development tenant.");
    return;
  }
  const slug = process.env.DEV_TENANT_SLUG || subdomain.toLowerCase();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, connections: { select: { id: true } } },
  });
  if (tenant && tenant.connections.length > 0) {
    console.log(`Development tenant "${slug}" is already connected.`);
    return;
  }
  values.name ??= process.env.DEV_TENANT_NAME || undefined;
  values["webhook-secret"] ??= process.env.ZENDESK_WEBHOOK_SECRET;
  await add(slug, subdomain, credentials);
}

async function list(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      name: true,
      connections: { select: { subdomain: true, authType: true, status: true, lastError: true, webhookSecret: true } },
      _count: { select: { memberships: { where: { active: true } }, tickets: true } },
    },
  });
  if (tenants.length === 0) {
    console.log("No tenants yet. Add one with: npm run tenant -- add --slug <slug> --subdomain <subdomain>");
    return;
  }
  console.table(
    tenants.map((t) => {
      const c = t.connections[0];
      return {
        slug: t.slug,
        name: t.name,
        zendesk: c ? `${c.subdomain}.zendesk.com` : "not connected",
        auth: c?.authType ?? "",
        status: c?.status ?? "",
        webhook: c?.webhookSecret ? "secret set" : "no secret",
        agents: t._count.memberships,
        tickets: t._count.tickets,
      };
    }),
  );
  for (const t of tenants) {
    const error = t.connections[0]?.lastError;
    if (error) console.log(`${t.slug}: last error: ${error}`);
  }
}

async function syncAgentsNow(slug: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const ticketing = await new TicketingRegistry(prisma, secrets).for(tenantId);
  const result = await syncAgents(prisma, tenantId, ticketing);
  console.log(`✔ ${slug}: ${result.active} active, ${result.deactivated} deactivated, ${result.skipped} skipped`);
}

async function setWebhookSecret(slug: string, secret: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const { count } = await prisma.tenantConnection.updateMany({
    where: { tenantId, provider: "zendesk" },
    data: { webhookSecret: secrets.encrypt(secret) },
  });
  if (count === 0) throw new Error(`Tenant "${slug}" has no Zendesk connection. Run add first.`);
  console.log(`✔ Webhook secret stored for ${slug}`);
}

async function setEnabled(slug: string, enabled: boolean): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  await prisma.tenantConnection.updateMany({
    where: { tenantId, provider: "zendesk" },
    data: { status: enabled ? "active" : "disabled" },
  });
  if (enabled) await queueImport(tenantId);
  console.log(`✔ ${slug} ${enabled ? "enabled" : "disabled"}`);
}

/** Queues the first (or a catch-up) ticket import for the worker. */
async function queueImport(tenantId: string): Promise<void> {
  const queue = new Queue(QUEUES.ticketSync, { connection: redisConnectionFromUrl(env.REDIS_URL) });
  try {
    await queue.add(
      TICKET_SYNC_JOBS.backfill,
      { tenantId },
      { jobId: `${TICKET_SYNC_JOBS.backfill}.${tenantId}`, removeOnComplete: true, removeOnFail: true },
    );
  } finally {
    await queue.close();
  }
}

async function tenantIdOf(db: PrismaClient, slug: string): Promise<string> {
  const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`No tenant with slug "${slug}". See: npm run tenant -- list`);
  return tenant.id;
}

function required(option: "slug" | "subdomain" | "webhook-secret"): string {
  const value = values[option];
  if (!value) throw new Error(`--${option} is required. Run: npm run tenant -- help`);
  return value;
}

/** Credentials from options first, then from ZENDESK_* variables. */
function credentialsFromOptions(): ZendeskCredentials {
  if (values["access-token"]) return { type: "access_token", accessToken: values["access-token"] };
  if (values.email && values["api-token"]) {
    return { type: "api_token", email: values.email, apiToken: values["api-token"] };
  }
  if (values["client-id"] && values["client-secret"]) {
    return { type: "oauth_client", clientId: values["client-id"], clientSecret: values["client-secret"] };
  }
  const fromEnv = zendeskCredentialsFromEnv(process.env);
  if (!fromEnv) {
    throw new Error("No Zendesk credentials. Pass --email and --api-token, or set ZENDESK_EMAIL and ZENDESK_API_TOKEN.");
  }
  return fromEnv;
}
