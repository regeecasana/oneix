# MVP scope

## Goal

Prove the core loop end to end for one tenant: a customer contacts by web chat or web call, an AI agent handles it, a human can receive or take over the conversation inside the oneix workspace, and the result lands on a ticket.

## In scope

### Customer side

- Embeddable widget with web chat and click-to-call (browser voice).
- AI agent answers all chats and calls first.
- Scheduled outbound AI call to a customer's phone number, for one use case: ticket follow-up.

### Agent side (oneix workspace)

- Sign in with SSO.
- Inbox: ticket list with basic filters (status, assignee).
- Ticket view: conversation thread, internal notes, status, priority, assignee.
- Live view: conversations currently handled by AI, with live transcript.
- Take over a live AI chat or call.
- Receive conversations handed over by the AI, with ticket and transcript already open.
- Softphone: accept, mute, hold, end.
- Agent availability state (available, unavailable).
- Schedule, view, and cancel an outbound AI call from a ticket.

### Platform

- Ticket created or matched for every conversation, stored in Zendesk.
- Transcript and AI summary written to the ticket when the conversation ends.
- Outbound call retry on no answer, with the outcome written to the ticket.
- Audit log of handovers, takeovers, and outbound calls.

## Stretch

- Inbound PSTN calls to the same voice flow. Low effort once the outbound number exists.
- Agent hands a conversation back to the AI.

## Out of scope (production phase)

- Multi-tenant administration and onboarding.
- Email, WhatsApp, SMS, and social channels.
- Macros, SLA timers, views builder, collision detection.
- Supervisor monitoring, whisper, and barge.
- Outbound campaigns, do-not-call lists, calling-hour rules.
- Reporting beyond a basic activity dashboard.
- Second ticketing backend.

## Assumptions

- A NICE CXone tenant, a Cognigy.AI tenant with Voice Gateway, and a Zendesk instance are available for the MVP.
- Voice transfer from Cognigy Voice Gateway to CXone already works (done by the team).
- Each oneix agent has a CXone agent and a Zendesk agent seat behind it.
- One language for the AI agent.

## Acceptance criteria

| # | Scenario | Passes when |
|---|---|---|
| 1 | Web chat resolved by AI | Ticket exists in Zendesk with full transcript and summary, and no human was involved |
| 2 | AI hands over a chat | Agent receives the chat in oneix with the ticket and prior transcript visible |
| 3 | AI hands over a call | Agent's softphone rings in oneix, and the ticket and transcript open on accept |
| 4 | Agent takes over a chat | Agent clicks takeover on a live AI chat, and the customer continues with the agent in the same widget |
| 5 | Agent takes over a call | Agent clicks takeover on a live AI call, and the call transfers to that agent's softphone |
| 6 | Scheduled outbound call | AI calls the customer at the scheduled time, and the outcome is on the ticket |
| 7 | Outbound not answered | Call is retried per the retry rule, and the final status is on the ticket |
| 8 | Zendesk hidden | No Zendesk URL, name, or branding appears in the widget or workspace |
