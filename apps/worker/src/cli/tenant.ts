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
  syncTicketForms,
  TicketingRegistry,
  type ZendeskCredentials,
  zendeskCredentialsFromEnv,
} from "@oneix/tenancy";
import { inviteToTenant, issueLink, suggestedBackendAgent } from "@oneix/accounts";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
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
  sync-agents         Refresh the tenant's Zendesk user directory and linked accounts now.
                                                                   --slug <slug>
  sync-forms          Refresh the tenant's ticket forms and custom fields now.  --slug <slug>
  resync-tickets      Re-import every ticket from Zendesk, for example after oneix starts storing a
                      new ticket field.                            --slug <slug>
  set-webhook-secret  Store the Zendesk webhook signing secret.  --slug <slug> --secret <secret>
  disable / enable    Stop or resume all Zendesk traffic for a tenant.  --slug <slug>
  bootstrap           Development: connect the tenant in DEV_TENANT_SLUG from ZENDESK_* variables,
                      unless it is already connected. Used by npm start.

People (oneix accounts)
  users               List the tenant's oneix accounts and their Zendesk links.  --slug <slug>
  invite              Invite someone to a tenant and print their invite link. Their account is
                      linked to the Zendesk user with the same email, if there is one.
                        --slug <slug> --email <email> --name <name> [--role agent|admin]
                        [--zendesk-user <id>]   link to this Zendesk user instead
  reset-link          Print a password reset link (or a fresh invite link if they never set a
                      password). There is no email sending yet; send the link yourself.
                        --email <email>
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
    role: { type: "string" },
    "zendesk-user": { type: "string" },
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
    WEB_ORIGIN: z.string().min(1).default("http://localhost:3000"),
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
    case "sync-forms":
      return syncFormsNow(required("slug"));
    case "resync-tickets":
      return resyncTickets(required("slug"));
    case "set-webhook-secret":
      return setWebhookSecret(required("slug"), values.secret ?? required("webhook-secret"));
    case "disable":
    case "enable":
      return setEnabled(required("slug"), command === "enable");
    case "users":
      return listUsers(required("slug"));
    case "invite":
      return invite(required("slug"), required("email"), required("name"));
    case "reset-link":
      return resetLink(required("email"));
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
  console.log(`  Directory:     ${result.agents.directory} Zendesk agents and admins, ${result.agents.linked} linked to oneix accounts`);
  console.log(`  Ticket forms:  ${result.ticketForms.forms} active forms, ${result.ticketForms.fields} active custom fields`);
  console.log(`  Ticket import: queued; the worker imports in the background`);
  console.log(`  Webhook URL:   <api host>/webhooks/zendesk/${slug}/ticket-updated`);
  console.log(`  Next:          invite people with npm run tenant -- invite --slug ${slug} --email … --name …`);
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

  // A new tenant has no oneix accounts. The owner of the Zendesk API token becomes its first admin.
  if (credentials.type === "api_token") {
    console.log("");
    values.role = "admin";
    await invite(slug, credentials.email, credentials.email.split("@")[0] ?? credentials.email);
  } else {
    console.log(`\nInvite the first admin: npm run tenant -- invite --slug ${slug} --email … --name … --role admin`);
  }
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
  console.log(`✔ ${slug}: ${result.directory} Zendesk users in the directory, ${result.linked} linked accounts refreshed, ${result.deactivated} lost access`);
}

async function syncFormsNow(slug: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const ticketing = await new TicketingRegistry(prisma, secrets).for(tenantId);
  const result = await syncTicketForms(prisma, tenantId, ticketing);
  console.log(`✔ ${slug}: ${result.forms} active ticket forms, ${result.fields} active custom fields`);
}

async function resyncTickets(slug: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const redis = new Redis(redisConnectionFromUrl(env.REDIS_URL));
  try {
    // The worker's backfill starts from the beginning when it has no cursor.
    await redis.del(`oneix:ticket-backfill:${tenantId}:cursor`);
  } finally {
    redis.disconnect();
  }
  await queueImport(tenantId);
  console.log(`✔ ${slug}: full ticket re-import queued; the worker runs it in the background`);
}

async function listUsers(slug: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: {
      role: true,
      active: true,
      zendeskUserId: true,
      roleNames: true,
      user: { select: { email: true, name: true, status: true, lastLoginAt: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  if (memberships.length === 0) {
    console.log(`No accounts in ${slug} yet. Invite someone: npm run tenant -- invite --slug ${slug} --email … --name …`);
    return;
  }
  console.table(
    memberships.map((m) => ({
      name: m.user.name,
      email: m.user.email,
      account: m.user.status,
      access: m.active ? "on" : "off",
      "oneix role": m.role,
      zendesk: m.zendeskUserId ? `${m.zendeskUserId} (${m.roleNames.join(", ")})` : "not linked",
      "last sign-in": m.user.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never",
    })),
  );
}

async function invite(slug: string, email: string, name: string): Promise<void> {
  const tenantId = await tenantIdOf(prisma, slug);
  const role = values.role ?? "agent";
  if (role !== "agent" && role !== "admin") throw new Error("--role must be agent or admin");

  // Operations confirm the link by running the command: an explicit Zendesk user, or the one with this email.
  const zendeskUserId =
    values["zendesk-user"] ?? (await suggestedBackendAgent(prisma, tenantId, email))?.externalId ?? null;

  const result = await inviteToTenant(prisma, { tenantId, email, name, role, zendeskUserId });
  console.log(`✔ ${email} added to ${slug} as ${role}`);
  console.log(`  Zendesk link:  ${zendeskUserId ? zendeskUserId : "none (link one from the Team page)"}`);
  if (result.link) {
    console.log(`  Invite link:   ${env.WEB_ORIGIN}/invite/${result.link.token}`);
    console.log(`  Expires:       ${result.link.expiresAt.toISOString()}`);
    console.log("  Send this link to them; it can be used once.");
  } else {
    console.log("  They already have a oneix account, so no invite link is needed.");
  }
}

async function resetLink(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, status: true, memberships: { select: { tenantId: true }, take: 1 } },
  });
  if (!user) throw new Error(`No oneix account for ${email}`);
  if (user.status === "disabled") throw new Error(`${email}'s account is disabled`);

  const neverSetPassword = user.status === "invited";
  const link = await issueLink(prisma, {
    userId: user.id,
    purpose: neverSetPassword ? "invite" : "password_reset",
    tenantId: user.memberships[0]?.tenantId,
  });
  const path = neverSetPassword ? "invite" : "reset-password";
  console.log(`✔ ${neverSetPassword ? "Invite" : "Password reset"} link for ${email} (expires ${link.expiresAt.toISOString()}):`);
  console.log(`  ${env.WEB_ORIGIN}/${path}/${link.token}`);
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

function required(option: "slug" | "subdomain" | "webhook-secret" | "email" | "name"): string {
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
