# Data model (MVP)

PostgreSQL through Prisma, defined in `packages/db`. Every table carries `tenantId`, `createdAt`, and `updatedAt`.

## Diagram

```mermaid
erDiagram
  Tenant ||--o{ User : has
  Tenant ||--o{ Customer : has
  Customer ||--o{ Ticket : requests
  Ticket ||--o{ Conversation : records
  Customer ||--o{ Conversation : takes_part_in
  Conversation ||--o{ TranscriptTurn : contains
  Conversation ||--o{ HandoverEvent : has
  User ||--o{ HandoverEvent : involved_in
  Ticket ||--o{ OutboundCall : schedules
  OutboundCall ||--o| Conversation : produces
  User ||--o{ AuditLog : performs
```

## Entities

### Tenant

| Field | Notes |
|---|---|
| `id`, `name` | One row in the MVP |
| `settings` | JSON: retry rule, business timezone |

### User

Agents and admins of the workspace.

| Field | Notes |
|---|---|
| `id`, `email`, `name` | |
| `role` | `agent`, `admin` |
| `ssoSubject` | Subject from the identity provider |
| `cxoneAgentId` | Mapped CXone agent |
| `zendeskUserId` | Mapped Zendesk agent |

### Customer

| Field | Notes |
|---|---|
| `id`, `name`, `email`, `phone` | Phone in E.164 format |
| `externalId` | Customer ID in the ticketing backend |

### Ticket

A cache of the ticketing backend's ticket. Zendesk remains the source of truth.

| Field | Notes |
|---|---|
| `id` | oneix ticket ID, shown in the workspace |
| `externalId` | Ticket ID in the ticketing backend |
| `customerId`, `assigneeId` | |
| `subject`, `status`, `priority` | |
| `lastSyncedAt` | Last refresh from the backend |

### Conversation

One chat or call session.

| Field | Notes |
|---|---|
| `id` | The `conversationId` used for correlation |
| `ticketId`, `customerId` | |
| `channel` | `chat`, `voice` |
| `direction` | `inbound`, `outbound` |
| `state` | `ai_active`, `queued`, `agent_active`, `closed` |
| `cognigySessionId`, `cognigyUserId` | Needed for the takeover signal |
| `cxoneContactId` | Set when an agent accepts |
| `agentId` | Agent who handled it, if any |
| `summary` | AI summary at the end |
| `closeReason` | `resolved_by_ai`, `resolved_by_agent`, `abandoned`, `failed` |
| `startedAt`, `endedAt` | |

### TranscriptTurn

| Field | Notes |
|---|---|
| `id`, `conversationId` | |
| `sender` | `customer`, `ai`, `agent`, `system` |
| `text` | |
| `sequence` | Order within the conversation |
| `occurredAt` | |

### HandoverEvent

| Field | Notes |
|---|---|
| `id`, `conversationId` | |
| `type` | `ai_handover`, `agent_takeover` |
| `reason` | From the AI, or blank for takeover |
| `requestedById` | Agent, for takeover |
| `acceptedById`, `acceptedAt` | |

### OutboundCall

| Field | Notes |
|---|---|
| `id`, `ticketId`, `customerId` | |
| `purpose` | Short text passed to the AI flow |
| `scheduledAt` | |
| `status` | `scheduled`, `dialing`, `in_progress`, `completed`, `no_answer`, `failed`, `cancelled` |
| `attempts`, `maxAttempts` | |
| `lastCallRef` | Call ID from Voice Gateway |
| `conversationId` | Set once the call is answered |
| `createdById` | Agent who scheduled it |

### WebhookEvent

| Field | Notes |
|---|---|
| `id`, `source` | `cognigy`, `voice_gateway`, `zendesk` |
| `eventKey` | Unique per source, used for idempotency |
| `payload`, `status`, `processedAt`, `error` | |

### AuditLog

| Field | Notes |
|---|---|
| `id`, `actorId`, `action` | For example `conversation.takeover`, `outbound_call.scheduled` |
| `targetType`, `targetId`, `metadata` | |

## Indexes

- `Conversation(tenantId, state)` for the Live view.
- `Conversation(cognigySessionId)` and `Conversation(cxoneContactId)` for webhook lookups.
- `Ticket(tenantId, status, assigneeId)` for the inbox.
- `Ticket(externalId)` unique per tenant.
- `TranscriptTurn(conversationId, sequence)`.
- `OutboundCall(status, scheduledAt)`.
- `WebhookEvent(source, eventKey)` unique.

## Retention

Not decided for the MVP. Transcripts contain personal data, so set a retention rule before the first real client.
