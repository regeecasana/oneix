# oneix

oneix is a CX orchestration platform. It gives clients one agent workspace and one customer widget, and runs three platforms behind them:

| Platform | Role in oneix | Visible to the client |
|---|---|---|
| NICE Cognigy | AI agents for chat and voice | No |
| NICE CXone | Human routing, queues, telephony | No |
| Zendesk | Ticket system of record | No, unless asked |

oneix itself is three things: an orchestration backend, an agent workspace UI, and an embeddable customer widget.

oneix is a B2B product: each client is a **tenant** with its own Zendesk instance, and their agents work in oneix instead of Zendesk.

**Status:** MVP in progress. Built so far: the ticketing slice (M1) and tenant connections (Z0), so several clients can run side by side, each with their own Zendesk. Next is the full Zendesk workspace: everything an agent does in Zendesk, in oneix. See [docs/08-zendesk-workspace.md](docs/08-zendesk-workspace.md). AI chat, handover, voice, and outbound calls follow. See [docs/07-mvp-roadmap.md](docs/07-mvp-roadmap.md).

## Contents

- [What runs today](#what-runs-today)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Adding a client tenant](#adding-a-client-tenant)
- [Connecting Zendesk](#connecting-zendesk)
- [Everyday commands](#everyday-commands)
- [Project layout](#project-layout)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## What runs today

| App | URL | What it does |
|---|---|---|
| `apps/web` | http://localhost:3000 | Agent workspace: sign-in, client switcher, inbox, ticket view with replies and notes |
| `apps/api` | http://localhost:4000 | REST API, per-tenant Zendesk webhooks. Health check at `/health` |
| `apps/worker` | — | Processes webhooks, keeps each tenant's ticket cache and agents in sync with its Zendesk. Also hosts the tenant CLI |

How tenants work:

- **Each tenant has its own Zendesk connection**, stored in the database with its credentials encrypted. Every Zendesk call uses the tenant's own credentials, so tenants never share data or rate limits.
- **Agents come from Zendesk.** Every Zendesk agent and admin of a tenant becomes a oneix agent automatically, linked by their Zendesk user ID. Agents removed or suspended in Zendesk lose access. The sync runs every hour and when a tenant is added.
- **One person can work for several clients.** Agents belong to tenants through memberships; an agent in more than one tenant switches client from the header.
- **Every query is scoped to the agent's tenant.** The API uses a database client that adds the tenant filter itself, so a forgotten filter can't show one client's data to another.

How ticket data moves:

- **Inbox** reads from each tenant's ticket cache in PostgreSQL, so it stays fast and does not use Zendesk API calls.
- **Ticket view** reads the ticket and its thread from Zendesk directly, and refreshes the cache on the way.
- **Changes** (public replies, internal notes, status, priority, assignee) are written to Zendesk as the signed-in agent. Zendesk emails public replies to the customer.
- **Cache freshness** comes from two sources per tenant: a Zendesk webhook for each ticket change, and a backfill every 5 minutes that catches anything missed. The first backfill imports all existing tickets.

Sign-in is a development stub: you pick a client, then an agent. SSO replaces it once the identity provider is chosen.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS recommended (24 or later) | Node 25 works, but some tools only support LTS releases. On Windows without admin rights, [nvm for Windows](https://github.com/coreybutler/nvm-windows) installs per user. |
| npm | 11 | Comes with Node. The repo uses npm workspaces; pnpm and yarn are not needed. |
| Docker Desktop | Any recent | Runs PostgreSQL and Redis locally. It must be **running** before you start. |
| Zendesk | An instance with an admin account | For API access and, optionally, the webhook. See [Connecting Zendesk](#connecting-zendesk). |

## Getting started

### Quick start: one command

```bash
npm start
```

On the first run it creates `.env` from `.env.example`, generates an encryption key, and stops so you can fill in the Zendesk values for your development tenant (see [Connecting Zendesk](#connecting-zendesk)). Run `npm start` again and it:

1. checks that Docker is running and starts PostgreSQL and Redis,
2. installs dependencies if `node_modules` is missing,
3. applies database migrations and builds the apps,
4. connects the development tenant from the `ZENDESK_*` values, the first time only, which also provisions its agents and queues the ticket import,
5. runs api, worker, and web in watch mode.

Every step is safe to repeat, so use the same command every time. Stop with Ctrl+C. The database containers keep running in the background; see [Everyday commands](#everyday-commands) to stop them.

Then open http://localhost:3000, pick the client and an agent. Tickets appear as the worker imports them, usually within a minute.

> Variables already set in your shell take precedence over `.env`. If a value seems ignored, check your system environment variables.

### Step by step

The same steps, run by hand. Useful when one of them fails. Run everything from the repo root.

```bash
npm install
cp .env.example .env                                      # then set ONEIX_ENCRYPTION_KEY and the ZENDESK_* values
docker compose -f infra/docker/docker-compose.yml up -d   # postgres, redis
npm run db:migrate                                        # apply migrations
npm run build                                             # the tenant CLI runs from the build
npm run tenant -- bootstrap                               # connect the development tenant from ZENDESK_* values
npm run dev                                               # api, worker, web
```

Generate the encryption key with `openssl rand -base64 32`, or let `npm start` do it.

## Adding a client tenant

Each client is added once by oneix operations with the tenant CLI. It checks the credentials belong to a Zendesk admin, stores them encrypted, provisions the client's agents, and queues the ticket import:

```bash
npm run tenant -- add --slug acme --name "Acme Corp" --subdomain acme
```

Credentials are read from `ZENDESK_EMAIL` and `ZENDESK_API_TOKEN` (or the other `ZENDESK_*` variables) so they stay out of your shell history. You can also pass them as options; see `npm run tenant -- help`.

| Command | Does |
|---|---|
| `npm run tenant -- list` | Every tenant with its Zendesk, connection status, webhook, agents, and cached tickets |
| `npm run tenant -- add ...` | Creates a tenant, or updates one, for example to rotate credentials |
| `npm run tenant -- sync-agents --slug acme` | Provisions agents from Zendesk now instead of waiting for the hourly sync |
| `npm run tenant -- set-webhook-secret --slug acme --secret ...` | Stores the signing secret of the tenant's Zendesk webhook |
| `npm run tenant -- disable --slug acme` | Stops all Zendesk traffic for the tenant. `enable` resumes it |

A connection whose credentials stop working is marked `failing` by the worker, with the error, and shows in `tenant list`.

## Connecting Zendesk

Everything here is per tenant, in that tenant's Zendesk Admin Center.

### 1. API access

oneix needs credentials of a Zendesk **admin**, because the ticket import and agent sync use admin-only APIs. One of:

| Method | `add` options or variables | Notes |
|---|---|---|
| API token (simplest) | `--email --api-token`, or `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN` | Create under **Apps and integrations → APIs → Zendesk API**. Cannot impersonate agents |
| OAuth access token | `--access-token`, or `ZENDESK_ACCESS_TOKEN` | A token you issued in advance |
| OAuth client | `--client-id --client-secret`, or `ZENDESK_CLIENT_ID`, `ZENDESK_CLIENT_SECRET` | Create under **Apps and integrations → APIs → OAuth Clients**. oneix uses the client credentials grant, so the client must allow it |

If several are set as variables, the access token wins, then the API token, then the OAuth client.

### 2. Agent attribution

Notes and ticket changes show the agent who made them, not the API user. By default, notes are attributed through the agent's Zendesk user ID, which provisioning sets for every agent. With `--impersonate` on `add` (OAuth only, token with the `impersonate` scope), every request is sent on behalf of the agent instead.

### 3. Webhook for ticket changes

Without the webhook, oneix still syncs through the backfill every 5 minutes. With it, changes made in Zendesk appear within seconds.

1. Under **Apps and integrations → Webhooks**, create a webhook:
   - Connection: Trigger or automation
   - Endpoint: `https://<your-api-host>/webhooks/zendesk/<tenant-slug>/ticket-updated`
   - Method: POST, format: JSON, no authentication
2. Store the webhook's **signing secret**: `npm run tenant -- set-webhook-secret --slug <tenant-slug> --secret <secret>`.
3. Under **Objects and rules → Triggers**, create a trigger:
   - Conditions (meet ANY): Ticket is Created, Ticket is Updated
   - Action: Notify active webhook, select the webhook above, with this body:

   ```json
   { "ticket_id": "{{ticket.id}}", "updated_at": "{{ticket.updated_at_with_timestamp}}" }
   ```

Zendesk must be able to reach the API. For local development, expose port 4000 with a tunnel (for example ngrok or Cloudflare Tunnel), or skip the webhook and rely on the backfill.

## Everyday commands

| Command | Does |
|---|---|
| `npm start` | Sets up everything that's missing, then runs the apps (see [Quick start](#quick-start-one-command)) |
| `npm run dev` | Runs api, worker, and web in watch mode, assuming setup is done |
| `npm run tenant -- <command>` | Manages client tenants (see [Adding a client tenant](#adding-a-client-tenant)) |
| `npm run build` | Builds every package and app |
| `npm run typecheck` | Type-checks the workspace |
| `npm run lint` | Lints the workspace |
| `npm test` | Runs unit tests |
| `npm run format` | Formats with Prettier |
| `npm run db:migrate` | Creates and applies migrations after a schema change |
| `npm run db:generate` | Regenerates the Prisma client |

The workspace UI is built with [shadcn/ui](https://ui.shadcn.com) (Radix, `radix-nova` style). To add a component, run the CLI from the web app: `cd apps/web && npx shadcn@latest add <component>`. Components land in `apps/web/components/ui`.

To run one app on its own, use its workspace name, for example `npm run dev -w @oneix/api`. Its dependencies must be built first (`npm run build`).

To stop the databases: `docker compose -f infra/docker/docker-compose.yml down`. Add `-v` to also delete their data.

## Project layout

```
oneix/
├── apps/
│   ├── api/          NestJS: REST API, auth, per-tenant Zendesk webhooks
│   ├── worker/       BullMQ: webhook processing, per-tenant backfill and agent sync, tenant CLI
│   └── web/          Next.js + shadcn/ui: agent workspace
├── packages/
│   ├── contracts/    Zod schemas and types shared across apps
│   ├── db/           Prisma schema, migrations, tenant-scoped client, ticket cache writer
│   ├── tenancy/      Tenant connections: credential encryption, per-tenant clients, agent provisioning
│   ├── ticketing/    TicketingProvider interface and the Zendesk adapter
│   ├── logger/       Structured logging (pino)
│   └── config/       Shared ESLint and Prettier config
├── infra/docker/     Local PostgreSQL and Redis
├── scripts/          start.mjs, behind npm start
└── docs/             Planning and design documents
```

Rules that keep the code vendor-neutral and tenants apart:

- Only `packages/ticketing` knows Zendesk exists. Everything else uses the `TicketingProvider` interface.
- Code gets a tenant's ticketing client from `TicketingRegistry`, never by building one from settings.
- API code reads tenant data through `scopedToTenant(prisma, tenantId)`, which filters every query by tenant.
- `apps/web` depends only on `@oneix/contracts`. No vendor types or names reach the workspace.
- Only `api` and `worker` touch the database.

The full target structure, including later milestones, is in [docs/04-project-structure.md](docs/04-project-structure.md).

## Environment variables

All variables are listed in [.env.example](.env.example), grouped by app. The api and worker validate their variables at startup and exit with a clear message if one is missing. Tenant settings, including Zendesk credentials, live in the database, not here.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api, worker | PostgreSQL connection |
| `REDIS_URL` | api, worker | Job queues |
| `ONEIX_ENCRYPTION_KEY` | api, worker | Encrypts tenant credentials. 32 bytes, base64. Without it, stored credentials can't be read |
| `DEV_TENANT_SLUG`, `DEV_TENANT_NAME`, `ZENDESK_*` | `npm start` | The development tenant, connected once. Defaults the slug to the subdomain |
| `SESSION_SECRET` | api | Signs session cookies. At least 32 characters |
| `AUTH_DEV_LOGIN` | api | Enables the development sign-in picker. Refused in production |
| `WEB_ORIGIN` | api | Allowed browser origin (CORS) |
| `TICKET_BACKFILL_INTERVAL_MINUTES` | worker | How often each tenant's ticket cache is backfilled |
| `AGENT_SYNC_INTERVAL_MINUTES` | worker | How often each tenant's agents are provisioned from Zendesk |
| `NEXT_PUBLIC_API_URL` | web | Where the workspace calls the API |

Zendesk credentials are never given to the web app.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `failed to connect to the docker API` | Docker Desktop is not running. Start it and retry. |
| api or worker exits with `Invalid ... configuration` | A required variable is missing from `.env`. The message names it. |
| `npm start` stops at "Connecting the development tenant" | The `ZENDESK_*` credentials are rejected, or don't belong to a Zendesk admin. The message says which. |
| Login page says sign-in is unavailable | The api is not running, or `AUTH_DEV_LOGIN` is not `true`. |
| Login page lists no clients | No tenant is connected yet. Set the `ZENDESK_*` values and run `npm start`, or use `npm run tenant -- add`. |
| Inbox stays empty | The worker is not running, the import is still in progress, or the filter is "Assigned to me" and nothing is assigned to you. Check `npm run tenant -- list` and the worker logs. |
| "This workspace isn't connected to its ticket service yet" | The tenant has no connection, or it is disabled. See `npm run tenant -- list`. |
| "The ticket service is unavailable" | A Zendesk call failed. The api logs show the cause. |
| A tenant shows `failing` in `tenant list` | Zendesk rejected its credentials. Rotate them with `npm run tenant -- add` and the same slug. |
| Webhook calls return 401 | The stored webhook secret doesn't match. Set it again with `set-webhook-secret`. |

## Documentation

| Doc | Contents |
|---|---|
| [docs/01-mvp-scope.md](docs/01-mvp-scope.md) | What the MVP includes, excludes, and must prove |
| [docs/02-architecture.md](docs/02-architecture.md) | Components, conversation states, key flows, API surface |
| [docs/03-tech-stack.md](docs/03-tech-stack.md) | Technology by layer |
| [docs/04-project-structure.md](docs/04-project-structure.md) | Monorepo layout and conventions |
| [docs/05-integrations.md](docs/05-integrations.md) | Cognigy, CXone, and Zendesk integration points |
| [docs/06-data-model.md](docs/06-data-model.md) | Entities and enums |
| [docs/07-mvp-roadmap.md](docs/07-mvp-roadmap.md) | Milestones, open items, what is deferred |
| [docs/08-zendesk-workspace.md](docs/08-zendesk-workspace.md) | Replacing the Zendesk Agent Workspace: feature map, tenancy, phases |

### How it will behave at MVP

- Every chat and call is answered by an AI agent first.
- The AI can hand over to a human agent.
- A human agent can take over a live AI conversation at any time.
- The AI can place scheduled outbound calls, for example to follow up on a ticket.
- Every conversation is recorded on a ticket.

### Naming

- Workspace packages are scoped `@oneix/*`.
- "Tenant" means one client of oneix. "Agent" means a person working tickets for a tenant.
- "Conversation" means one chat or call session. "Ticket" means the durable record it is attached to.
