# Integrations (MVP)

How oneix connects to each platform. Items marked **verify** need confirming against the actual tenant before build.

## Correlation

| ID | Created by | Carried in |
|---|---|---|
| `conversationId` | oneix | Cognigy session data, SIP header on transfer, CXone contact data, Zendesk ticket field |
| `ticketId` | oneix | Cognigy session data, outbound call metadata |
| Cognigy `sessionId` and `userId` | Cognigy | Stored on the oneix conversation, used for the takeover signal |
| CXone `contactId` | CXone | Stored on the oneix conversation when the agent accepts |
| Zendesk ticket ID | Zendesk | Stored on the oneix ticket record |

## NICE Cognigy

**Role:** AI agent for chat and voice. Decides when to hand over.

### What oneix uses

| Piece | Purpose |
|---|---|
| Webchat endpoint | Chat channel behind the widget |
| Voice Gateway endpoint with Click To Call | Browser voice channel behind the widget |
| Handover to Human Agent node, CXone handover provider | Chat handover to CXone |
| Transfer node | Voice handover to CXone over SIP |
| oneix Extension (`@oneix/cognigy-extension`) | Flow nodes that call oneix webhooks |
| Session inject | oneix sends the takeover signal into a live session |
| Voice Gateway REST API | Creates outbound calls, with a status callback URL |

### oneix Extension nodes

| Node | Calls | When |
|---|---|---|
| Start Conversation | `/webhooks/cognigy/conversation-started` | Start of every flow. Returns `conversationId`, `ticketId`, and customer context |
| Log Turn | `/webhooks/cognigy/turn` | After each customer and AI turn |
| Request Handover | `/webhooks/cognigy/handover-requested` | Just before the Handover or Transfer node |
| End Conversation | `/webhooks/cognigy/conversation-ended` | On resolution or hangup, with summary |

### Flow requirements

- Every flow starts with Start Conversation and stores the returned IDs in session context.
- Every flow has a takeover branch: when the injected takeover signal arrives, go straight to Request Handover, then the Handover or Transfer node.
- Voice transfers add `conversationId` as a custom SIP header.
- Outbound flows read `ticketId` and purpose from the call metadata.

### Notes

- Cognigy's CXone handover provider is for chat. Voice handover through the Transfer node is not supported by that provider, so voice uses the SIP transfer path.
- The handover provider has an integrated and a non-integrated variant, depending on how the Cognigy tenant is connected to CXone. **Verify** which applies.
- **Verify** the session inject API for both Webchat and Voice Gateway endpoints.

## NICE CXone

**Role:** Queues, agent availability, and delivery of chats and calls to human agents.

### What oneix uses

| Piece | Purpose |
|---|---|
| ACD skills and queues | Routing for handed-over chats and calls |
| Studio scripts | Read `conversationId` on arrival and route the contact |
| SIP trunk from Voice Gateway | Carries transferred calls |
| Digital channel created by the handover provider | Carries handed-over chats |
| Agent SDK in the workspace | Agent login, state, call control, softphone, chat contacts |

### Workspace behaviour

- The agent signs in to oneix, then the workspace starts a CXone agent session through the SDK.
- When a contact is offered, the workspace reads `conversationId` from the contact data and loads the ticket and transcript from the oneix API.
- On accept, the workspace calls `POST /conversations/:id/accepted` with the CXone `contactId`.
- Live chat messages between agent and customer go through CXone. The workspace also posts them to oneix so the transcript stays complete.

### Notes

- The SDK requires the application to be registered with CXone.
- **Verify** how custom SIP headers and handover data appear on the contact in the Agent SDK.
- **Verify** how to route a takeover to one specific agent (agent-targeted skill, or a Studio script that routes by agent ID).
- **Verify** whether SSO can cover both the oneix sign-in and the CXone agent session, so the agent signs in once.

## Zendesk

**Role:** Ticket and customer system of record. Never in the live conversation path, never shown to clients.

### What oneix uses

| Piece | Purpose |
|---|---|
| Tickets API | Create, read, update tickets |
| Users API | Find or create the customer by email or phone |
| Ticket comments | Transcript, AI summary, internal notes, outbound call outcomes |
| Custom ticket fields | `oneix_conversation_id`, `oneix_channel`, `oneix_handled_by` |
| Webhook with trigger | Notifies oneix when a ticket changes |

### Adapter interface

All access goes through `TicketingProvider` in `@oneix/ticketing`:

```
findOrCreateCustomer(identity)
createTicket(input)
getTicket(id)
listTickets(filter)
updateTicket(id, changes)
addNote(id, note)
addConversationRecord(id, transcript, summary)
```

### Notes

- Agent actions are written as the mapped Zendesk agent, so ticket history shows the right person.
- All Zendesk calls from webhooks go through the worker queue to respect rate limits.
- **Verify** licensing: each oneix agent likely needs a Zendesk agent seat, and reselling a hidden Zendesk may need a partner agreement.

## Identity mapping

One oneix user maps to one CXone agent and one Zendesk agent.

| oneix | CXone | Zendesk |
|---|---|---|
| `User.id` | `cxoneAgentId` | `zendeskUserId` |

For the MVP, mappings are seeded by script.

## Secrets

| Secret | Used by |
|---|---|
| Cognigy API key, endpoint tokens | api, worker |
| Voice Gateway API key, account SID | worker |
| CXone API credentials | api |
| CXone application registration (client ID) | web |
| Zendesk OAuth credentials | api, worker |
| Webhook shared secrets, one per sender | api |

## References

- [Cognigy: Click To Call](https://docs.cognigy.com/click-to-call)
- [Cognigy: NiCE CXone handover provider](https://docs.cognigy.com/ai/escalate/handover-reference/nice-cxone/overview)
- [Cognigy: Create outbound calls](https://docs.cognigy.com/voice-gateway/creating-outbound-calls)
- [Cognigy: Outbound call statuses](https://docs.cognigy.com/voice-gateway/call-statuses.md)
- [NICE CXone: Agent Workspace SDK](https://help.nicecxone.com/Content/agent/agentapplicationadministration/cxoneagent/cxasdk.htm)
- [NICE CXone Agent SDK on npm](https://npmjs.com/package/@nice-devone/agent-sdk)
