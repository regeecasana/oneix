# Tech stack (MVP)

Use current LTS or stable versions at project start, and pin them in the repo.

## Monorepo and language

| Technology | Purpose |
|---|---|
| TypeScript | One language across apps and packages |
| npm workspaces | Package management and linking |
| Turborepo | Task running and build caching |
| ESLint, Prettier | Linting and formatting, shared from `packages/config` |
| Vitest | Unit and integration tests |
| Playwright | End-to-end tests for the workspace |

## oneix applications

| App | Technology | Purpose |
|---|---|---|
| `apps/api` | Node.js, NestJS | REST API, webhooks, WebSocket gateway |
| `apps/worker` | Node.js, BullMQ | Scheduled and background jobs |
| `apps/web` | Next.js, React | Agent workspace |
| `apps/widget` | TypeScript, Vite (library build) | Embeddable customer widget |

## Data and messaging

| Technology | Purpose |
|---|---|
| PostgreSQL | Conversations, transcripts, ticket cache, outbound calls, audit log |
| Prisma | Schema, migrations, typed client |
| Redis | Job queue backend, realtime pub/sub, short-lived session state |
| BullMQ | Delayed jobs (outbound calls), retries, webhook processing |
| Socket.IO | Realtime events from API to workspace |
| Zod | Shared request, response, and event schemas |

## Frontend

| Technology | Purpose |
|---|---|
| Tailwind CSS, shadcn/ui | Styling and base components |
| TanStack Query | Server state and caching |
| Auth.js | SSO sign-in (OIDC) |
| CXone Agent SDK (`@nice-devone/agent-sdk`) | Agent state, call control, softphone, and chat contacts in the workspace |

## Vendor platforms

| Platform | Pieces used |
|---|---|
| **NICE Cognigy** | AI agent flows, Webchat endpoint, Voice Gateway, Click To Call, CXone handover provider, a custom oneix Extension, Voice Gateway outbound call API |
| **NICE CXone** | ACD skills and queues, Studio scripts, SIP trunk from Voice Gateway, digital channel for chat handover, Agent SDK |
| **Zendesk** | Ticketing API (tickets, users, comments), webhooks and triggers |
| **Speech and LLM** | One STT/TTS provider and one LLM, configured in Cognigy |
| **Telephony** | One PSTN number on a SIP trunk connected to Voice Gateway, for outbound calls |

## Infrastructure

| Technology | Purpose |
|---|---|
| Docker | Container images for api, worker, web |
| Docker Compose | Local PostgreSQL and Redis |
| AWS ECS (Fargate) | Runs api, worker, web |
| AWS RDS (PostgreSQL) | Managed database |
| AWS ElastiCache (Redis) | Managed Redis |
| AWS S3 and CloudFront | Hosts the widget bundle |
| AWS Secrets Manager | Vendor credentials |
| GitHub Actions | CI: lint, typecheck, test, build, deploy |
| Sentry | Error tracking |
| Structured JSON logs (pino) | Application logging |

## Deferred to production

Event bus, data warehouse, Terraform, multi-AZ and autoscaling, WAF, distributed tracing, SCIM, secrets rotation, PII redaction.
