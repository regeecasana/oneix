# Zendesk workspace

oneix replaces the Zendesk Agent Workspace. Agents work every ticket in oneix and never see Zendesk. Zendesk stays the engine behind it: tickets, customers, business rules, SLAs, and email.

The rule: **anything an agent can do in Zendesk, they can do in oneix.** oneix uses Zendesk's APIs to the full rather than rebuilding what Zendesk already does.

## Product model

- oneix is a B2B product. Each client is a **tenant**.
- Each tenant has its **own Zendesk instance**: the client's own, or one oneix provides through its Zendesk partnership.
- oneix runs on the highest Zendesk tier, so every API below is available.
- Client agents sign in to oneix only. Each one still holds a Zendesk agent seat behind the scenes.

## Who does what

| Work | Where | Who |
|---|---|---|
| Working tickets, queues, customers | oneix | Client agents |
| Business rules: triggers, automations, SLA policies, routing, business hours | Zendesk, applied automatically | Configured by oneix operations |
| Configuration: ticket fields and forms, views, macros, groups, channels, email addresses | Zendesk Admin Center | Configured by oneix operations |
| Reporting | Zendesk Explore for now (no API) | oneix operations |

Configuration made in Zendesk shows up in oneix automatically, because oneix reads fields, forms, views, macros, and groups from the API.

## Tenant connections

Every Zendesk call is made for a tenant, with that tenant's credentials.

- A tenant's connection holds its subdomain, credentials, and webhook signing secret. Credentials are encrypted at rest.
- Supported credentials, per tenant: OAuth access token, API token, or OAuth client.
- The api and worker keep one Zendesk client per tenant.
- Webhooks are addressed per tenant: `/webhooks/zendesk/:tenantId/...`.
- The ticket backfill runs per tenant, with its own cursor.
- Agents are provisioned from the tenant's Zendesk agents and linked by Zendesk user ID automatically. No manual mapping.

## Feature map

Phases are explained in [Delivery phases](#delivery-phases).

### Ticket work

| Feature | Zendesk API | Phase |
|---|---|---|
| Public replies and internal notes, rich text | Ticket comments (`html_body`, `public`) | Z1 |
| Attachments, upload and view | Uploads, comment attachments | Z1 |
| CCs and followers | Ticket `email_ccs`, `followers` | Z1 |
| Tags | Tags | Z1 |
| Ticket forms and custom fields, including conditions | Ticket Forms, Ticket Fields, Dynamic Content | Z1 |
| Group and assignee | Groups, Group Memberships, Assignable agents | Z1 |
| Custom statuses | Custom Ticket Statuses | Z1 |
| Type, priority, due date, problem and incident links | Tickets | Z1 |
| Ticket history: who changed what and when | Ticket Audits | Z1 |
| Create a ticket, change the requester | Tickets | Z1 |
| Merge tickets | Ticket Merge | Z1 |
| Mark as spam, delete | Tickets | Z1 |

### Finding work

| Feature | Zendesk API | Phase |
|---|---|---|
| Views as the agent's queues, with counts | Views (list, execute, count) | Z2 |
| Search across tickets, customers, organizations | Search, Export Search Results | Z2 |
| Macros: browse, preview, apply | Macros (`/apply`) | Z2 |
| Customer profile with ticket history, identities, notes | Users, User Identities | Z2 |
| Organization profile with members and tickets | Organizations, Organization Memberships | Z2 |
| Edit customer and organization details, custom fields | Users, Organizations, User and Organization Fields | Z2 |

### Productivity and live updates

| Feature | Zendesk API | Phase |
|---|---|---|
| Live updates when a ticket changes | Webhooks, then oneix realtime to the workspace | Z3 |
| "Another agent is viewing or replying" | Built in oneix; Zendesk has no public API for it | Z3 |
| SLA targets and breach countdown | SLA Policies, Ticket Metric Events | Z3 |
| Satisfaction ratings | Satisfaction Ratings | Z3 |
| Side conversations | Side Conversations | Z3 |
| Knowledge: search and insert help center articles | Help Center (Guide) Search, Articles | Z3 |
| Agent notifications: assigned, mentioned, customer replied | Webhooks and triggers, then oneix realtime | Z3 |

### Not used from Zendesk

- **Zendesk Talk, Chat, and Messaging.** Voice and chat run through Cognigy and CXone. See [05-integrations.md](05-integrations.md).
- **Zendesk Apps Framework sidebar apps.** They run inside Zendesk's UI. Equivalent features are built into oneix.

## Data strategy

| Data | Read from | Why |
|---|---|---|
| Ticket detail, thread, history | Zendesk, live | Always current |
| Queues (views) and search | Zendesk, live | Matches Zendesk's rules exactly; no reimplemented filters |
| Fields, forms, groups, macros, statuses, views list | Zendesk, cached per tenant for minutes | Change rarely; saves API calls |
| Ticket cache in PostgreSQL | Zendesk, through webhooks and backfill | Links tickets to oneix conversations; fast lists |

All writes go to Zendesk first. oneix updates its cache from the response.

## Rate limits

Every agent action is an API call, so each tenant has an API budget.

- The highest tier allows about 2,500 requests per minute per instance. **Verify** the exact limit for each tenant's plan.
- Some endpoints have their own limits, for example the incremental export and repeated updates to the same ticket.
- oneix tracks remaining budget per tenant from Zendesk's rate-limit headers, and background work slows down before agent actions are affected.

## Delivery phases

Each phase ends with something an agent can use.

### Z0. Tenant connections

Per-tenant Zendesk connections stored in the database, per-tenant webhooks and backfill, agents provisioned from Zendesk, and a script to onboard a tenant.

**Done when:** two tenants with different Zendesk instances work side by side, each agent seeing only their tenant's tickets.

**Status:** built. Tenants are added with `npm run tenant -- add`; see the README. Verified with two tenants: each agent sees only their own tenant's tickets and agents, cannot open another tenant's ticket by ID, and cannot switch into a tenant they don't belong to. Still to verify with a second real Zendesk instance.

### Z1. Full ticket view

Everything in [Ticket work](#ticket-work).

**Done when:** an agent can handle any ticket, including email tickets, from first reply to solved, without Zendesk.

### Z2. Finding work

Everything in [Finding work](#finding-work).

**Done when:** an agent's daily queue, search, and macros match what they would have in Zendesk.

### Z3. Productivity and live updates

Everything in [Productivity and live updates](#productivity-and-live-updates).

**Done when:** an agent sees changes, SLAs, and colleagues' activity without refreshing.

## Open items

| # | Item | Blocks |
|---|---|---|
| 1 | Exact API rate limit for each tenant's plan, and whether the High Volume API add-on applies | Z0 |
| 2 | ~~Where tenant credentials are encrypted~~ AES-256-GCM with an application key (`ONEIX_ENCRYPTION_KEY`), from AWS Secrets Manager in AWS. Move to KMS if clients require it | — |
| 3 | How agents sign in per tenant with SSO. Today: sign in once, then pick or switch client in the workspace | SSO |
| 4 | Rendering customer HTML email safely in the workspace (sanitizer and allowed tags) | Z1 |
| 5 | Which Zendesk events to subscribe to for live updates, and the webhook volume per tenant | Z3 |
