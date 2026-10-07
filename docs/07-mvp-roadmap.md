# MVP roadmap

Milestones are ordered by dependency. Each one ends with something demonstrable.

## Milestones

### M0. Foundations

- Monorepo scaffold: npm workspaces, Turborepo, shared config, CI.
- `packages/db` with the initial schema and seed.
- `apps/api` and `apps/web` skeletons with SSO sign-in.
- Local Docker Compose, one deployed dev environment.

**Done when:** an agent can sign in to an empty workspace in the dev environment.

### M1. Ticketing

- `@oneix/ticketing` with the Zendesk adapter.
- Inbox and ticket view: list, thread, internal note, status, priority, assignee.
- Zendesk webhook to ticket cache.

**Done when:** an agent works a ticket end to end in oneix, and no Zendesk screen is needed.

**Status:** done for one tenant: inbox with pagination, ticket view, internal notes, status, priority, assignee, webhook and backfill sync.

### Z0–Z3. Zendesk workspace

Zendesk comes first: before the AI milestones, oneix becomes a complete replacement for the Zendesk Agent Workspace, for multiple tenants. Phases and the feature list are in [08-zendesk-workspace.md](08-zendesk-workspace.md).

- **Z0.** Tenant connections: per-tenant Zendesk credentials, webhooks, backfill, and agents provisioned from Zendesk.
- **Z1.** Full ticket view: replies, attachments, fields and forms, tags, groups, history, merge.
- **Z2.** Finding work: views, search, macros, customer and organization profiles.
- **Z3.** Productivity and live updates: realtime, collision, SLAs, satisfaction, side conversations, knowledge.

**Done when:** an agent's whole day happens in oneix, for any tenant.

### M2. AI chat

- `apps/widget` with chat.
- `@oneix/cognigy-extension` with all four nodes, and a first AI flow.
- Conversation creation, transcript streaming, Live view.
- Transcript and summary written to the ticket on close.

**Done when:** acceptance scenario 1 passes.

### M3. Chat handover and takeover

- CXone handover provider and Studio script for chat.
- CXone Agent SDK session, agent state, and chat contact handling in the workspace.
- Takeover endpoint and the takeover branch in the flow.

**Done when:** acceptance scenarios 2 and 4 pass.

### M4. Voice

- Click-to-call in the widget.
- Softphone in the workspace.
- `conversationId` carried on the SIP transfer and read in the workspace.
- Takeover for voice.

**Done when:** acceptance scenarios 3 and 5 pass.

### M5. Outbound

- Schedule, list, and cancel from the ticket view.
- Worker job, Voice Gateway outbound API, status webhook, retry rule.
- Outbound AI flow with ticket context.

**Done when:** acceptance scenarios 6 and 7 pass.

### M6. Hardening and pilot

- Webhook idempotency and retry paths tested with failures injected.
- Branding pass on widget and workspace (acceptance scenario 8).
- Error tracking, logs, basic activity dashboard.
- Pilot with an internal team.

**Done when:** all eight acceptance scenarios pass in the pilot environment.

## Open items to resolve early

| # | Item | Blocks |
|---|---|---|
| 1 | Session inject works on both Webchat and Voice Gateway endpoints for the takeover signal | M3, M4 |
| 2 | Routing a takeover to the specific agent in CXone | M3, M4 |
| 3 | How SIP headers and handover data surface on the contact in the Agent SDK | M3, M4 |
| 4 | Integrated or non-integrated CXone handover provider for the Cognigy tenant | M3 |
| 5 | Single sign-on across oneix and the CXone agent session | M3 |
| 6 | ~~Zendesk seat licensing and partner terms for a hidden backend~~ Resolved: oneix is a Zendesk partner on the highest tier | — |
| 7 | SIP trunk and number for outbound PSTN calls | M5 |
| 8 | Consent and calling rules for outbound AI calls | M5 pilot |
| 9 | Transcript and recording retention rule | Pilot with a real client |

Items 1 to 3 carry the most technical risk. Prove them with a spike during M0 or M1.

## Risks

| Risk | Mitigation |
|---|---|
| Takeover latency feels slow to the customer | Measure in the spike, and have the AI say a short bridging line during transfer |
| Transcript gaps after handover | Workspace posts agent and customer messages to oneix during the human leg |
| Zendesk rate limits under load | All writes go through the worker queue, and the inbox reads from the cache |
| Vendor API changes | Vendor code is isolated in adapter packages |

## Deferred to the production phase

Self-service tenant administration, more channels, supervisor tools, outbound campaigns and compliance tooling, reporting and warehouse, event bus, infrastructure as code, high availability, tracing, PII redaction, second ticketing backend.
