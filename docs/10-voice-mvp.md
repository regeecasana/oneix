# Voice MVP: website calls with AI handover

The first voice feature, built on **Cognigy, oneix, and Zendesk** only. The call scope is WebRTC: customers call from a website, agents answer in the oneix workspace. The wider plan is in [09-voice-architecture.md](09-voice-architecture.md).

## What happens on a call

1. The customer opens the contact center page (`apps/landing`), enters their name and email, and starts a call. The call widget is built on the Cognigy **Click To Call SDK**.
2. oneix finds or creates the customer in Zendesk, opens a ticket for the call, and returns a **call token**. The widget passes it to the SDK as `userId`, so it becomes the caller's SIP user and the Cognigy Flow reads it as `input.userId`.
3. The AI agent answers. The Flow tells oneix, and the call appears in the workspace: **Live calls** in the sidebar, and a **Call in progress** banner on the ticket.
4. When the AI agent hands over, the Flow sends oneix the conversation. oneix adds it to the ticket as an **internal note**, in oneix and Zendesk, and returns the softphones of every **available** agent.
5. Voice Gateway rings those agents at once. Each sees a pop-up with the caller and ticket. The first to answer gets the call; the ticket is assigned to them and opens, with the AI conversation on it, so the customer doesn't repeat themselves.
6. If nobody answers in 30 seconds, the AI agent says so, gives the ticket number, and ends the call. The ticket stays open for a callback.

Only the AI part of the call is transcribed in this version. Transcribing the agent's part comes later.

## Parts

| Part | Where |
|---|---|
| Contact center page and call widget | `apps/landing` (port 3002) |
| Website call API: ticket and token | `POST /widget/calls` |
| Flow API: start, handover, event (or missed and ended) | `POST /voice/flow/calls/{token}/…` |
| Softphone registration webhook for Voice Gateway | `POST /voice/sip/register` |
| Agent API: live calls, answer, end, availability, live events | `/voice/calls`, `/voice/presence`, `/voice/events` |
| Agent softphone (JsSIP), pop-up, live calls, banner | `apps/web/features/voice` |

All endpoints are in the API reference at `/docs`, under **Voice**.

## Setup

The full step-by-step configuration, from Cognigy to Voice Gateway to oneix, is in [11-voice-setup-guide.md](11-voice-setup-guide.md). The summary below lists what each system needs.

### 1. oneix

In `.env`:

| Variable | Value |
|---|---|
| `VOICE_FLOW_SECRET` | A long random string. The Cognigy Flow sends it as `Authorization: Bearer …`. |
| `VOICE_GATEWAY_WEBHOOK_SECRET` | Voice Gateway's Webhook Secret (step 2). |
| `VOICE_SIP_REALM` | The SIP realm agents' softphones register in (step 2). |
| `VOICE_GATEWAY_WSS_URL` | Voice Gateway's secure WebSocket for SIP (step 2). |
| `NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL` | The Click To Call Endpoint URL (step 3). |
| `NEXT_PUBLIC_LANDING_TENANT` | The workspace whose agents take the calls, for example `con-blinkcx2`. |
| `WIDGET_ORIGINS` | Websites allowed to start calls. `http://localhost:3002` locally. |

Cognigy and Voice Gateway must reach the API. Locally, forward port **4000** in VS Code (**Ports** > **Forward a Port** > `4000`, then set **Port Visibility** to **Public**) and use that address below as `<oneix>`. The address changes when forwarding restarts.

### 2. Voice Gateway Self-Service Portal

- **Speech Services**: ElevenLabs for speech-to-text and text-to-speech.
- **Applications**: an application for the Cognigy Endpoint, with ElevenLabs as the default speech vendor.
- **Accounts**, on the account:
  - **Registration webhook**: `<oneix>/voice/sip/register`.
  - **Webhook Secret**: copy it into `VOICE_GATEWAY_WEBHOOK_SECRET`.
  - The **SIP realm**, if shown: copy it into `VOICE_SIP_REALM`.
- The realm and the WebSocket address also appear in the Click To Call configuration: open the Click To Call Endpoint URL (step 3) in a browser and read `sipConnectivityInfo.realm` and `sipConnectivityInfo.wsUri`. Use them for `VOICE_SIP_REALM` and `VOICE_GATEWAY_WSS_URL`.

### 3. Cognigy

1. A **Voice Gateway Endpoint** with **Click To Call** turned on, linked to the Flow below. Copy its Click To Call **Endpoint URL** into `NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL`.
2. Keep the oneix address and secret in one place, for example a Connection or project variables, and send `Authorization: Bearer <VOICE_FLOW_SECRET>` and `Content-Type: application/json` on every HTTP Request node.
3. Build the Flow below.

## The Flow

Every request is keyed by the call token, `{{input.userId}}`, so one Flow serves every call.

| # | Node | Settings |
|---|---|---|
| 1 | **Lookup** on Voice Gateway call events | `CALL_COMPLETED` goes to node 9; `NO_ANSWER`, `TRANSFER_DIAL_ERROR`, and `USER_BUSY` go to node 8; anything else continues to node 2 |
| 2 | **Once** → **HTTP Request** | `POST <oneix>/voice/flow/calls/{{input.userId}}/start`, body `{ "sessionId": "{{input.sessionId}}" }`. Store the response in the context as `oneix.start` |
| 3 | **Say** | `Hi {{context.oneix.start.firstName}}, thanks for calling Acme. How can I help?` |
| 4 | **AI Agent** (GPT) | The conversation. Give it a tool, `transfer_to_human`, for when the caller asks for a person or it can't help |
| 5 | **Get Transcript** (on the tool's branch) | Limit 50, store in the context as `transcript` |
| 6 | **HTTP Request** | `POST <oneix>/voice/flow/calls/{{input.userId}}/handover`, body `{ "reason": "Customer asked for a person", "transcript": {{context.transcript}} }`. Store the response as `oneix.handover` |
| 7 | **If** `context.oneix.handover.targets.length > 0`: **Say** "Connecting you with an agent now", then the **Code** node below. Else go to node 8 | |
| 8 | **HTTP Request** `POST …/missed`, then **Say** "Our agents are busy right now. Your reference is {{context.oneix.start.ticketNumber}}; we'll get back to you by email.", then **Hang Up** | |
| 9 | **HTTP Request** `POST …/ended` | Removes the call from the live list |

The Code node rings the agents oneix returned, with the call and ticket in SIP headers:

```js
const handover = context.oneix.handover;
api.output(null, {
  _cognigy: {
    "_voice-gateway2": {
      json: {
        verb: "dial",
        actionHook: "dial",
        target: handover.targets,
        headers: handover.headers,
        timeout: handover.timeout,
      },
    },
  },
});
```

### What oneix answers

`start`:

```json
{ "ticketNumber": 9799, "customerName": "Jane Cruz", "firstName": "Jane" }
```

`handover`: the transcript is read leniently (an array of turns with `text` or `payload.text`, the speaker from `role`, `source`, or `type`; the same as a JSON string; or plain text).

```json
{
  "ticketNumber": 9799,
  "targets": [{ "type": "user", "name": "oneix-3f2a…@<realm>" }],
  "headers": { "X-Oneix-Call": "cmv7…", "X-Oneix-Ticket": "9799" },
  "timeout": 30
}
```

`handover` also returns `say`: what Adam says now. When nobody is available, `targets` is empty, the call is marked missed, and `say` is the busy message with the ticket number read digit by digit.

`event`: pass any Voice Gateway call event as `{ "event": "NO_ANSWER" }`. `CALL_COMPLETED` ends the call; `NO_ANSWER`, `USER_BUSY`, `TRANSFER_DIAL_ERROR`, and `TRANSFER_REFER_ERROR` mark it missed and return `{ "action": "busy", "say": "…" }`; anything else returns `{ "action": "none", "say": null }`.

`missed` and `ended` (for a hand-built Flow): `{ "ok": true }`.

The Flow can be built with `npm run cognigy:flow`; see [11-voice-setup-guide.md](11-voice-setup-guide.md), part 5.

Errors: `401` without the right bearer token, `404` for an unknown call token, `503` if `VOICE_FLOW_SECRET` isn't set.

## Agents

- **Available for calls**, top right in the workspace, makes an agent's browser register its softphone with Voice Gateway and puts them on the list of agents to ring. The workspace checks in every 30 seconds; an agent who closes it drops off within about a minute.
- Agents must be linked to a Zendesk user to take calls, because the ticket is assigned to them.
- The incoming-call pop-up shows the caller, email, and ticket. **Answer and open ticket** connects the call and opens the ticket. The top bar shows the call with mute and hang up.

## Try it locally

1. `npm start` runs the API, worker, workspace (3000), and landing page (3002).
2. In the workspace, set yourself **Available for calls**. The dot turns green once the softphone registers.
3. Open http://localhost:3002, click **Talk to us**, and start a call.
4. Talk to the AI agent and ask for a person. The pop-up rings in the workspace.

Without Cognigy, `npm run voice:simulate` plays the Flow's part of a call (start, handover with a sample transcript, end) while you watch the workspace. It creates a real ticket. Options: `--name`, `--email`, `--tenant`, and `--pause` (seconds between steps, default 10).

## To confirm on the first real call

These come from documentation that doesn't spell them out, so check them on the first call:

1. **The call token reaches the Flow as `input.userId`.** The SDK makes it the caller's SIP user. If it arrives elsewhere, adjust the HTTP Request URLs.
2. **The registration webhook's request.** oneix follows jambonz's format (Voice Gateway runs on jambonz): a SIP digest in the body, a `VG-Signature` header from the Webhook Secret (jambonz's signing scheme), and `{ "status": "ok" }` in reply. The API logs every refused registration.
3. **The Get Transcript output.** oneix reads common shapes. If the note on the ticket comes out empty, send the raw output and adjust `transcript.ts`.
4. **Dial outcome events** for node 1's Lookup.

## Known limits

- **The customer's email isn't verified.** Anyone can type any email; the ticket goes to that requester. Authenticating callers is the next step.
- **Only the AI part is transcribed.**
- **The integration user.** Notes written by oneix (the call note and the transcript) are credited to the Zendesk user behind the connection's credentials. A dedicated "oneix" Zendesk user keeps them apart from a real admin.
- **Rate limit.** Ten calls per address every ten minutes, per API instance, so a public form can't flood Zendesk with tickets.
