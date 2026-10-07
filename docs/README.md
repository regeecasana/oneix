# oneix

oneix is a CX orchestration platform. It gives clients one agent workspace and one customer widget, and runs three platforms behind them:

| Platform | Role in oneix | Visible to the client |
|---|---|---|
| NICE Cognigy | AI agents for chat and voice | No |
| NICE CXone | Human routing, queues, telephony | No |
| Zendesk | Ticket system of record | No, unless asked |

oneix itself is three things: an orchestration backend, an agent workspace UI, and an embeddable customer widget.

**Status:** MVP planning.

## How it behaves

- Every chat and call is answered by an AI agent first.
- The AI can hand over to a human agent.
- A human agent can take over a live AI conversation at any time.
- The AI can place scheduled outbound calls, for example to follow up on a ticket.
- Every conversation is recorded on a ticket.

## Documentation

This README sits at the repo root. The numbered files go in `docs/`.

| Doc | Contents |
|---|---|
| [01-mvp-scope.md](docs/01-mvp-scope.md) | What the MVP includes, excludes, and must prove |
| [02-architecture.md](docs/02-architecture.md) | Components, conversation states, key flows, API surface |
| [03-tech-stack.md](docs/03-tech-stack.md) | Technology by layer |
| [04-project-structure.md](docs/04-project-structure.md) | Monorepo layout and conventions |
| [05-integrations.md](docs/05-integrations.md) | Cognigy, CXone, and Zendesk integration points |
| [06-data-model.md](docs/06-data-model.md) | Entities and enums |
| [07-mvp-roadmap.md](docs/07-mvp-roadmap.md) | Milestones, open items, what is deferred |
| [08-zendesk-workspace.md](docs/08-zendesk-workspace.md) | Replacing the Zendesk Agent Workspace: feature map, tenancy, phases |

## Local development (planned)

```bash
npm install
cp .env.example .env                                      # then fill in the Zendesk values
docker compose -f infra/docker/docker-compose.yml up -d   # postgres, redis
npm run db:migrate
npm run db:seed
npm run dev                                               # api, worker, web, widget
```

## Naming

- Workspace packages are scoped `@oneix/*`.
- "Conversation" means one chat or call session. "Ticket" means the durable record it is attached to.
