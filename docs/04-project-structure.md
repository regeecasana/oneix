# Project structure (monorepo)

npm workspaces with Turborepo. Deployable apps live in `apps/`, shared code in `packages/`, vendor platform config in `platform/`.

## Tree

```
oneix/
├── apps/
│   ├── api/                              # NestJS: REST, webhooks, realtime gateway
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/                   # env validation, typed config
│   │   │   ├── common/                   # guards, filters, interceptors, idempotency
│   │   │   └── modules/
│   │   │       ├── auth/                 # SSO session validation, roles
│   │   │       ├── users/                # agents and their vendor identities
│   │   │       ├── customers/
│   │   │       ├── tickets/              # uses @oneix/ticketing
│   │   │       ├── conversations/        # state machine, transcript
│   │   │       ├── handover/             # AI handover and agent takeover
│   │   │       ├── outbound/             # schedule and cancel outbound calls
│   │   │       ├── realtime/             # Socket.IO gateway
│   │   │       ├── webhooks/
│   │   │       │   ├── cognigy/
│   │   │       │   ├── voice-gateway/
│   │   │       │   └── zendesk/
│   │   │       ├── audit/
│   │   │       └── health/
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── worker/                           # BullMQ processors
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── processors/
│   │   │   │   ├── outbound-call.processor.ts
│   │   │   │   ├── ticket-write.processor.ts      # transcript and summary to ticket
│   │   │   │   ├── ticket-sync.processor.ts       # cache refresh from webhooks
│   │   │   │   └── webhook.processor.ts
│   │   │   └── schedulers/               # repeatable jobs
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── web/                              # Next.js agent workspace
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/login/
│   │   │   │   ├── (workspace)/
│   │   │   │   │   ├── layout.tsx        # shell: nav, agent state, softphone dock
│   │   │   │   │   ├── inbox/
│   │   │   │   │   ├── tickets/[id]/
│   │   │   │   │   ├── live/             # AI conversations in progress
│   │   │   │   │   └── outbound/
│   │   │   │   └── api/auth/             # Auth.js route handlers
│   │   │   ├── features/
│   │   │   │   ├── tickets/
│   │   │   │   ├── conversations/        # transcript, takeover button
│   │   │   │   ├── softphone/            # call controls on the CXone Agent SDK
│   │   │   │   ├── agent-state/
│   │   │   │   └── outbound/
│   │   │   ├── lib/                      # api client, socket client, cxone session
│   │   │   └── styles/
│   │   ├── e2e/                          # Playwright
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── widget/                           # embeddable customer widget
│       ├── src/
│       │   ├── loader.ts                 # single script tag entry
│       │   ├── chat.ts                   # wraps Cognigy Webchat
│       │   ├── voice.ts                  # wraps Cognigy Click To Call
│       │   └── theme.ts                  # oneix branding
│       ├── demo/index.html
│       └── package.json
│
├── packages/
│   ├── contracts/                        # Zod schemas, DTOs, enums, event names
│   ├── db/                               # Prisma schema, migrations, client, seed
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       ├── migrations/
│   │       └── seed.ts
│   ├── ticketing/                        # TicketingProvider interface
│   │   └── src/
│   │       ├── provider.ts
│   │       └── zendesk/                  # Zendesk implementation
│   ├── cognigy/                          # session inject, Voice Gateway calls, payload types
│   ├── cxone/
│   │   └── src/
│   │       ├── server/                   # CXone API client for api and worker
│   │       └── browser/                  # Agent SDK wrapper for web
│   ├── cognigy-extension/                # custom Cognigy Extension: oneix nodes for flows
│   ├── ui/                               # shared React components
│   ├── logger/
│   └── config/                           # shared tsconfig, eslint, prettier
│
├── platform/                             # config that lives in vendor platforms, kept in git
│   ├── cognigy/                          # flow exports, endpoint settings
│   ├── cxone/                            # Studio scripts, skills, points of contact
│   └── zendesk/                          # custom fields, webhooks, triggers
│
├── infra/
│   ├── docker/
│   │   └── docker-compose.yml            # local postgres and redis
│   └── aws/                              # ECS task definitions, deploy scripts
│
├── docs/                                 # these documents
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── .env.example
├── package.json
├── package-lock.json
├── turbo.json
├── tsconfig.base.json
└── README.md
```

## Apps

| App | Package name | Deploys as |
|---|---|---|
| `apps/api` | `@oneix/api` | Container |
| `apps/worker` | `@oneix/worker` | Container |
| `apps/web` | `@oneix/web` | Container |
| `apps/widget` | `@oneix/widget` | Static bundle on a CDN |

## Packages

| Package | Used by | Notes |
|---|---|---|
| `@oneix/contracts` | all | No runtime dependencies beyond Zod |
| `@oneix/db` | api, worker | Only these two apps touch the database |
| `@oneix/ticketing` | api, worker | The only place that knows Zendesk exists |
| `@oneix/cognigy` | api, worker | Server-side clients and payload types |
| `@oneix/cxone` | api, worker, web | Separate `server` and `browser` entry points |
| `@oneix/cognigy-extension` | uploaded to Cognigy | Nodes that call oneix webhooks from flows |
| `@oneix/ui` | web | Shared components |
| `@oneix/logger` | api, worker | Structured logging |
| `@oneix/config` | all | Tooling presets |

## Dependency rules

- Apps depend on packages. Packages never depend on apps.
- Vendor packages (`ticketing`, `cognigy`, `cxone`) do not import `db`.
- `web` and `widget` do not import `db`, `ticketing`, `cognigy`, or the `server` entry of `cxone`.
- Vendor names stay inside their package. No Zendesk types in `apps/web`, so the workspace stays vendor-neutral.
- Cross-app communication goes through `contracts` types, not shared implementation code.

## Root scripts

| Script | Does |
|---|---|
| `npm run dev` | Runs api, worker, web, and widget in watch mode |
| `npm run build` | Builds everything through Turborepo |
| `npm run lint` / `npm run typecheck` / `npm test` | Quality checks across the workspace |
| `npm run db:migrate` | Applies Prisma migrations |
| `npm run db:seed` | Seeds a tenant and test agents |
| `npm run extension:build` | Packages the Cognigy Extension for upload |

## Environment

- One `.env.example` at the root lists every variable, grouped by app.
- Each app validates its own variables at startup and fails fast if one is missing.
- Vendor credentials are never exposed to `web` or `widget`.

## The `platform/` folder

Cognigy flows, CXone Studio scripts, and Zendesk settings are part of the product even though they run in vendor platforms. Exporting them into git gives the team review, history, and a way to rebuild an environment.
