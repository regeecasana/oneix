# oneix

oneix is a CX orchestration platform. It gives clients one agent workspace and one customer widget, and runs three platforms behind them:

| Platform | Role in oneix | Visible to the client |
|---|---|---|
| NICE Cognigy | AI agents for chat and voice | No |
| NICE CXone | Human routing, queues, telephony | No |
| Zendesk | Ticket system of record | No, unless asked |

oneix itself is three things: an orchestration backend, an agent workspace UI, and an embeddable customer widget.

**Status:** MVP in progress. The ticketing slice (milestone M1) is built: agents work Zendesk tickets entirely inside oneix. AI chat, handover, voice, and outbound calls come in later milestones. See [docs/07-mvp-roadmap.md](docs/07-mvp-roadmap.md).

## Contents

- [What runs today](#what-runs-today)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Connecting Zendesk](#connecting-zendesk)
- [Everyday commands](#everyday-commands)
- [Project layout](#project-layout)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## What runs today

| App | URL | What it does |
|---|---|---|
| `apps/web` | http://localhost:3000 | Agent workspace: sign-in, inbox, ticket view |
| `apps/api` | http://localhost:4000 | REST API, Zendesk webhook receiver. Health check at `/health` |
| `apps/worker` | — | Processes webhooks and keeps the ticket cache in sync with Zendesk |

How data moves:

- **Inbox** reads from a ticket cache in PostgreSQL, so it stays fast and does not hit Zendesk rate limits.
- **Ticket view** reads the ticket and its thread from Zendesk directly, and refreshes the cache on the way.
- **Changes** (status, priority, assignee, internal notes) are written to Zendesk as the signed-in agent.
- **Cache freshness** comes from two sources: a Zendesk webhook for each ticket change, and a backfill job every 5 minutes that catches anything missed. The first backfill imports all existing tickets.

Sign-in is a development stub: you pick a seeded agent from a list. SSO replaces it once the identity provider is chosen.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS recommended (24 or later) | Node 25 works, but some tools only support LTS releases. On Windows without admin rights, [nvm for Windows](https://github.com/coreybutler/nvm-windows) installs per user. |
| npm | 11 | Comes with Node. The repo uses npm workspaces; pnpm and yarn are not needed. |
| Docker Desktop | Any recent | Runs PostgreSQL and Redis locally. It must be **running** before you start. |
| Zendesk | An instance with an admin account | For the OAuth client, the webhook, and agent IDs. See [Connecting Zendesk](#connecting-zendesk). |

## Getting started

### Quick start: one command

```bash
npm start
```

That's it. On the first run it creates `.env` from `.env.example` and stops, so you can fill in the Zendesk values (see [Connecting Zendesk](#connecting-zendesk)). Run `npm start` again and it:

1. checks that Docker is running and starts PostgreSQL and Redis,
2. installs dependencies if `node_modules` is missing,
3. applies database migrations,
4. seeds the tenant and agents,
5. runs api, worker, and web in watch mode.

Every step is safe to repeat, so use the same command every time. Stop with Ctrl+C. The database containers keep running in the background; see [Everyday commands](#everyday-commands) to stop them.

Then open http://localhost:3000 and pick an agent.

> Variables already set in your shell take precedence over `.env`. If a value seems ignored, check your system environment variables.

### Step by step

The same steps, run by hand. Useful when one of them fails. Run everything from the repo root.

**1. Install dependencies**

```bash
npm install
```

**2. Create your environment file**

```bash
cp .env.example .env
```

Fill in the Zendesk values (`ZENDESK_SUBDOMAIN`, and either `ZENDESK_CLIENT_ID` with `ZENDESK_CLIENT_SECRET` or `ZENDESK_ACCESS_TOKEN`). The defaults work for everything else in local development. Every app reads this one root `.env` file.

**3. Start PostgreSQL and Redis**

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

**4. Create the database schema**

```bash
npm run db:migrate
```

This applies the migrations in `packages/db/prisma/migrations`. After you change `schema.prisma`, the same command asks for a name and creates a new migration.

**5. Seed the tenant and agents**

```bash
npm run db:seed
```

This creates the tenant and the agents listed in `packages/db/prisma/seed-users.example.json`. To use real agents, see [Map agents to Zendesk](#3-map-agents-to-zendesk).

**6. Start the apps**

```bash
npm run dev
```

This builds the shared packages, then runs api, worker, and web in watch mode.

**7. Sign in**

Open http://localhost:3000, pick an agent, and you land in the inbox. The inbox fills up once the worker's first backfill finishes, usually within a minute.

## Connecting Zendesk

oneix needs three things from Zendesk. All of them are set up in Zendesk Admin Center.

### 1. API access

Set one of these in `.env`. If several are set, the first one in this table wins.

| Method | Variables | Notes |
|---|---|---|
| OAuth access token | `ZENDESK_ACCESS_TOKEN` | A token you issued in advance |
| API token (simplest) | `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN` | Create under **Apps and integrations → APIs → Zendesk API**. Cannot impersonate agents |
| OAuth client | `ZENDESK_CLIENT_ID`, `ZENDESK_CLIENT_SECRET` | Create under **Apps and integrations → APIs → OAuth Clients**. oneix requests tokens with the client credentials grant, so the client must allow it |

The user behind the credentials should be an admin, because the backfill uses Zendesk's incremental export.

If the inbox stays empty, check the worker logs for a 401 from Zendesk. That means the credentials were rejected.

### 2. Agent attribution

Notes and ticket changes should show the agent who made them, not the API user. Two modes, set with `ZENDESK_IMPERSONATE`:

| Value | How it works | Requirement |
|---|---|---|
| `false` (default) | Notes are attributed to the agent's Zendesk user ID | The agent has a `zendeskUserId` mapping |
| `true` | Every request is sent on behalf of the agent | OAuth only: the token has the `impersonate` scope, and the agent's oneix email matches their Zendesk email |

### 3. Map agents to Zendesk

Assigning tickets to an agent requires knowing their Zendesk user ID. Create `packages/db/prisma/seed-users.json` (git-ignored) in the same format as the example file:

```json
[
  { "email": "sam@yourcompany.com", "name": "Sam Agent", "role": "agent", "zendeskUserId": "123456789" }
]
```

Then run `npm run db:seed` again. Tickets assigned to Zendesk agents without a mapping show as unassigned in oneix.

### 4. Webhook for ticket changes

Without the webhook, oneix still syncs through the backfill every 5 minutes. With it, changes made in Zendesk appear within seconds.

1. Under **Apps and integrations → Webhooks**, create a webhook:
   - Connection: Trigger or automation
   - Endpoint: `https://<your-api-host>/webhooks/zendesk/ticket-updated`
   - Method: POST, format: JSON, no authentication
2. Copy the webhook's **signing secret** into `ZENDESK_WEBHOOK_SECRET`.
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
| `npm run build` | Builds every package and app |
| `npm run typecheck` | Type-checks the workspace |
| `npm run lint` | Lints the workspace |
| `npm test` | Runs unit tests |
| `npm run format` | Formats with Prettier |
| `npm run db:migrate` | Creates and applies migrations after a schema change |
| `npm run db:seed` | Creates or updates the tenant and agents |
| `npm run db:generate` | Regenerates the Prisma client |

To run one app on its own, use its workspace name, for example `npm run dev -w @oneix/api`. Its dependencies must be built first (`npm run build`).

To stop the databases: `docker compose -f infra/docker/docker-compose.yml down`. Add `-v` to also delete their data.

## Project layout

```
oneix/
├── apps/
│   ├── api/          NestJS: REST API, auth, Zendesk webhook receiver
│   ├── worker/       BullMQ: webhook processing, ticket backfill
│   └── web/          Next.js: agent workspace
├── packages/
│   ├── contracts/    Zod schemas and types shared across apps
│   ├── db/           Prisma schema, migrations, seed, ticket cache writer
│   ├── ticketing/    TicketingProvider interface and the Zendesk adapter
│   ├── logger/       Structured logging (pino)
│   └── config/       Shared ESLint and Prettier config
├── infra/docker/     Local PostgreSQL and Redis
├── scripts/          start.mjs, behind npm start
└── docs/             Planning and design documents
```

Rules that keep the code vendor-neutral:

- Only `packages/ticketing` knows Zendesk exists. Everything else uses the `TicketingProvider` interface.
- `apps/web` depends only on `@oneix/contracts`. No vendor types or names reach the workspace.
- Only `api` and `worker` touch the database.

The full target structure, including later milestones, is in [docs/04-project-structure.md](docs/04-project-structure.md).

## Environment variables

All variables are listed in [.env.example](.env.example), grouped by app. The api and worker validate their variables at startup and exit with a clear message if one is missing.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api, worker, db | PostgreSQL connection |
| `REDIS_URL` | api, worker | Job queues |
| `TENANT_ID` | api, worker, db | The single MVP tenant |
| `ZENDESK_*` | api, worker | Zendesk access. See [Connecting Zendesk](#connecting-zendesk) |
| `SESSION_SECRET` | api | Signs session cookies. At least 32 characters |
| `AUTH_DEV_LOGIN` | api | Enables the development agent picker. Refused in production |
| `WEB_ORIGIN` | api | Allowed browser origin (CORS) |
| `TICKET_BACKFILL_INTERVAL_MINUTES` | worker | How often the cache backfill runs |
| `NEXT_PUBLIC_API_URL` | web | Where the workspace calls the API |

Zendesk credentials are never given to the web app.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `failed to connect to the docker API` | Docker Desktop is not running. Start it and retry. |
| api or worker exits with `Invalid ... configuration` | A required variable is missing from `.env`. The message names it. |
| Login page says sign-in is unavailable | The api is not running, or `AUTH_DEV_LOGIN` is not `true`. |
| Login page lists no agents | Run `npm run db:seed`. |
| Inbox stays empty | The worker is not running, the Zendesk credentials are wrong, or the filter is "Assigned to me" and your agent has no `zendeskUserId`. Check the worker logs, or switch the filter to "Everyone". |
| "The ticket service is unavailable" | A Zendesk call failed. The api logs show the cause. |
| "This agent isn't set up to receive tickets yet" | The agent has no `zendeskUserId`. See [Map agents to Zendesk](#3-map-agents-to-zendesk). |
| Webhook calls return 401 | `ZENDESK_WEBHOOK_SECRET` does not match the webhook's signing secret. |

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

### How it will behave at MVP

- Every chat and call is answered by an AI agent first.
- The AI can hand over to a human agent.
- A human agent can take over a live AI conversation at any time.
- The AI can place scheduled outbound calls, for example to follow up on a ticket.
- Every conversation is recorded on a ticket.

### Naming

- Workspace packages are scoped `@oneix/*`.
- "Conversation" means one chat or call session. "Ticket" means the durable record it is attached to.
