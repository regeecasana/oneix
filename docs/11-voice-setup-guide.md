# Voice setup guide: Cognigy, Voice Gateway, and oneix

Everything to configure, in order, to make website calls work end to end: a customer calls from the landing page, the AI agent **Adam** answers, and when the customer asks for a person, an available oneix agent's browser rings and opens the ticket with the AI conversation on it.

How the feature works, and the API the Flow calls, are in [10-voice-mvp.md](10-voice-mvp.md). This guide is the setup.

**Order matters.** Some values only exist after an earlier step (the tunnel address, the Endpoint URL, the SIP realm), so follow the parts in order. Plan for about two hours the first time.

| Part | Where | You end with |
|---|---|---|
| [1. Before you start](#1-before-you-start) | Accounts and keys | Everything you need at hand |
| [2. oneix and the tunnel](#2-oneix-and-the-tunnel) | Your laptop | oneix running, reachable from the internet |
| [3. Voice Gateway account](#3-voice-gateway-account) | Voice Gateway Self-Service Portal | Voice Gateway linked to Cognigy, softphone registration pointed at oneix |
| [4. Cognigy project](#4-cognigy-project) | Cognigy | The LLM, ElevenLabs speech, and the AI agent Adam |
| [5. The Flow](#5-the-flow) | Cognigy | The call Flow, talking to oneix |
| [6. Endpoint and Click To Call](#6-endpoint-and-click-to-call) | Cognigy | The Voice Gateway Endpoint and its Click To Call URL |
| [7. Finish oneix's settings](#7-finish-oneixs-settings) | `.env` | oneix knows the realm, the WebSocket, and the Endpoint URL |
| [8. Test, step by step](#8-test-step-by-step) | Browser | A working call, checked at each stage |

## 1. Before you start

You need:

- **Cognigy**: an organization with **Voice Gateway** and **Click To Call**, and a project you can edit. Your Cognigy user needs the `voice-gatewayUser` role to open the Voice Gateway Self-Service Portal.
- **Voice Gateway Self-Service Portal** access with the **Account** scope.
- **OpenAI API key**, for the AI agent's model.
- **ElevenLabs API key**, for speech-to-text and text-to-speech.
  ElevenLabs speech-to-text is behind a feature flag on Cognigy SaaS. If ElevenLabs isn't in the **Speech Provider** list in step 4.2, ask Cognigy technical support to enable ElevenLabs Speech Services for your organization.
- **oneix** cloned and installed, with Docker Desktop running (`npm start` needs Postgres and Redis).
- **VS Code**, for port forwarding.

Keep a scratch note open for the values you'll copy between systems:

| Value | Comes from | Goes to |
|---|---|---|
| Tunnel address (`https://…`) | Part 2 | Voice Gateway (3.3), Cognigy Flow (5.1) |
| `VOICE_FLOW_SECRET` | `.env` (already generated) | Cognigy Flow (5.1) |
| Webhook Secret | Voice Gateway (3.3) | `.env` `VOICE_GATEWAY_WEBHOOK_SECRET` |
| Click To Call Endpoint URL | Cognigy (6.2) | `.env` `NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL` |
| SIP realm and WebSocket URL | The Endpoint URL's configuration (7.1) | `.env` `VOICE_SIP_REALM`, `VOICE_GATEWAY_WSS_URL` |

## 2. oneix and the tunnel

Cognigy and Voice Gateway run in the cloud, so they need a public address for oneix's API.

1. **Free port 3000.** oneix's workspace runs there. Stop any other app using it.
2. **Start oneix**: `npm start` in the repo. Wait for:
   - Workspace: http://localhost:3000
   - Landing page: http://localhost:3002
   - API: http://localhost:4000
3. **Forward the API port.** In VS Code, open the **Ports** panel, click **Forward a Port**, and enter `4000`. Right-click the port, choose **Port Visibility > Public**. Copy the forwarded address, for example `https://abc123-4000.asse.devtunnels.ms`. This is **`<oneix>`** in the rest of this guide.
4. **Check it**: open `<oneix>/health` in a browser. You should see `{"status":"ok"}`.

The tunnel address changes when forwarding restarts. When it does, update it in Voice Gateway (3.3) and in the Flow (5.1).

## 3. Voice Gateway account

### 3.1 Link Voice Gateway to your Cognigy organization

Skip this if your organization is already linked.

1. In the **Voice Gateway Self-Service Portal**, go to **Accounts**, select your account, and copy its **Account SID**.
2. In Cognigy, open **User Menu > Admin Center > Dashboard**, click **Set up Voice Gateway**, and paste the SID into **Voice Gateway Account ID**.
3. In **Admin Center > Access Control**, give the `voice-gatewayUser` role to everyone who needs the portal.

### 3.2 Speech services

Click To Call takes its speech provider from the Cognigy project (step 4.2), and Cognigy creates the Voice Gateway Application for you (step 6.2). Nothing to do in **Speech Services** now. You'll check the Application in step 6.3.

### 3.3 Account settings for agents' softphones

oneix agents answer calls in the browser. Their browsers register with Voice Gateway as SIP devices, and Voice Gateway asks oneix whether each one may register.

In the portal, go to **Accounts**, select your account, and set:

| Setting | Value |
|---|---|
| **Registration Webhook** | `<oneix>/voice/sip/register` |
| **Webhook Secret** | Generate or copy it, and put it in `.env` as `VOICE_GATEWAY_WEBHOOK_SECRET` |

Leave the other account settings as they are.

## 4. Cognigy project

Create a project for oneix voice (for example `OneIX Voice`), or use an existing one.

### 4.1 The LLM

1. Go to **Build > LLM** and click **+ New LLM**.
2. Fill in:
   - **Name**: `OneIX`
   - **Description**: `Voice AI agent model for OneIX (Adam). Chosen for low latency and reliable tool calls.`
   - **Provider**: OpenAI
   - **Model**: `gpt-4.1`
3. Add a **Connection** with your OpenAI API key, and save.
4. Make it the project's default model.
5. Later, once calls work, add an **LLM Fallback** (for example `gpt-4.1-mini`) so a short OpenAI outage doesn't leave Adam silent.

`gpt-4.1` doesn't reason before answering, so replies come fast; on a phone call, every second of thinking is a second of silence. You can try `gpt-5-4-mini` later with **Custom Model Options** `{"reasoning": {"effort": "none"}}` and compare.

### 4.2 Speech provider (ElevenLabs)

1. Go to **Manage > Settings > Voice Preview Settings**.
2. In **Speech Provider**, select **ElevenLabs**.
3. Next to **Speech Connection**, create a connection:
   - **Connection**: `ElevenLabs`
   - **API Key**: your ElevenLabs key
   - **Region**: **Global**, or **Europe** if your data must stay in the EU
4. Save.

The Click To Call Application inherits this provider for speech-to-text and text-to-speech.

### 4.3 The AI agent: Adam

Go to **Build > AI Agents** and click **Create AI Agent** (or **+ New AI Agent**).

**General Settings**

- **Name**: `Adam`
- **Description**:
  ```
  Adam is Acme Support's voice assistant and answers every call first: warm, calm, and efficient. Adam helps customers with orders, billing, and account questions, and when a customer needs a person, gathers the key details so the human agent can pick up without the customer repeating themselves.
  ```

**Speaking Style**

- **Concise / Comprehensive**: toward **Concise**.
- **Formal / Informal**: the middle, friendly but professional.
- **Voice Configuration**:
  - **TTS Vendor**: ElevenLabs
  - **TTS Language**: English (`en-US`)
  - **TTS Voice**: pick a calm, clear voice and listen with Voice Preview
  - **Language Configuration**: turn it **off** so Adam always answers in English, unless you want automatic language switching

**Instructions**

```
- You are speaking on a phone call, not writing. Your words are turned into speech.
- Keep every reply to one to three short sentences. Ask one question at a time.
- Never use lists, bullet points, markdown, emojis, or URLs.
- Say numbers naturally, and reference numbers digit by digit.
- If you didn't understand, ask the customer to repeat, in different words. Don't guess.
- Never ask for or repeat a full card number, CVV, PIN, password, or one-time code. If the customer starts saying one, stop them politely.
- Don't promise refunds, credits, or outcomes. Say what a person on the team can review.
- Don't invent account, order, or policy details you weren't given.
- Stay calm and empathetic if the customer is upset.
```

**Knowledge Store**: skip for now. Later, upload FAQs (orders, billing, account) so Adam can answer common questions.

**Data Privacy & Security**

- **Contact Profile Information**: None.
- **Safety Instructions**: turn all four on.

**Job Selection**: **Personality Only**. The job is set on the AI Agent node in the Flow (step 5.2).

## 5. The Flow

### 5.0 Build it with the script (recommended)

`npm run cognigy:flow` builds the AI agent **Adam**, the Flow **OneIX Web Call** with every node, and the **Voice Gateway Endpoint** through Cognigy's REST API.

1. In `.env`, set:

   | Variable | Value |
   |---|---|
   | `COGNIGY_API_BASE_URL` | Your Cognigy API URL, for example `https://api-app.cognigy.ai`, or for a NiCE CXone environment `https://cognigy-api-<region>.nicecxone.com` |
   | `COGNIGY_API_KEY` | Cognigy: **User Menu > My Profile > API Keys > Create New** |
   | `COGNIGY_PROJECT_ID` | The project's ID: the 24-character part of its address in Cognigy |
   | `ONEIX_PUBLIC_API_URL` | The tunnel address from part 2 (`<oneix>`) |

   `VOICE_FLOW_SECRET` is already set.

   Optional, for Adam's voice: `COGNIGY_TTS_VOICE` (an ElevenLabs voice ID), `COGNIGY_TTS_LANGUAGE` (default `en-US`), and `COGNIGY_TTS_MODEL` (default `eleven_flash_v2_5`). Without a voice ID, Adam uses the Endpoint's default voice.

2. Run `npm run cognigy:flow`. It creates the AI agent Adam (or updates him if he exists), the Flow, and the Endpoint. To rebuild later (for example when the tunnel address changes), run `npm run cognigy:flow -- --replace`.
3. Continue with **part 6**. The script creates the Endpoint, but the **Set Up Click To Call Integration** button (6.2) isn't in the API, so that step stays manual.

The Flow it builds:

```
Start
└─ Code: oneix settings and call event      sets context.oneix, reads any Voice Gateway call event
└─ If: Call event?
   ├─ Then: HTTP Request → oneix /event     oneix decides: call ended, or nobody answered
   │        Code: say busy and hang up      only when oneix answers "busy"
   └─ Else: If: First turn?
            └─ Then: HTTP Request → oneix /start   ticket number and caller's name
            AI Agent: Adam (job: front-line support and handover)
            └─ Tool: transfer_to_human (reason)
               └─ Get Transcript → HTTP Request → oneix /handover → Code: ring agents
```

oneix makes the decisions (missed or ended, what to say when nobody is free), so the Flow needs no branches for them.

**If the script stops.** It checks every node type and setting against Cognigy's own node descriptors before creating anything. If one doesn't match, it creates nothing, removes the empty Flow, and writes `cognigy-flow-report.json` with the details (no secrets). Send that file over to get the script adjusted. To look at the descriptors yourself: `npm run cognigy:flow -- --inspect`.

**Building it by hand** instead: follow 5.1 and 5.2 below. They describe the same Flow with separate `missed` and `ended` requests, which oneix also accepts.

### 5.1 Settings for every request to oneix

First node of the Flow: a **Code** node named `oneix settings`:

```js
// Where oneix is, and the secret it expects from this Flow.
// Change the URL when the tunnel address changes.
context.oneix = context.oneix || {};
context.oneix.api = "https://abc123-4000.asse.devtunnels.ms";
context.oneix.secret = "<VOICE_FLOW_SECRET from .env>";
```

Every **HTTP Request** node below uses:

- **Method**: POST
- **Headers**:
  - `Authorization`: `Bearer {{context.oneix.secret}}`
  - `Content-Type`: `application/json`
- **Store Response**: in the Context, under the key given in each step

The secret sits in the Flow's context for now. Turn on **Mask Sensitive Logging** on the Endpoint (step 6.2) so it doesn't show in logs. Move it to a Cognigy Connection when you set up a shared environment.

### 5.2 Nodes

| # | Node | Settings |
|---|---|---|
| 1 | **Code**: `oneix settings` | As in 5.1 |
| 2 | **Lookup**, type: Voice Gateway call events | **`CALL_COMPLETED`** → node 10. **`NO_ANSWER`**, **`TRANSFER_DIAL_ERROR`**, **`USER_BUSY`** → node 9. **Default** → node 3 |
| 3 | **Once** | Runs the start step only on the first turn |
| 4 | **HTTP Request** (inside Once) | **URL**: `{{context.oneix.api}}/voice/flow/calls/{{input.userId}}/start`<br>**Body**: `{ "sessionId": "{{input.sessionId}}" }`<br>**Store**: Context key `oneix.start` |
| 5 | **Say** (inside Once) | `Hi {{context.oneix.start.firstName}}, thanks for calling Acme. I'm Adam. How can I help?` |
| 6 | **AI Agent** | **AI Agent**: Adam. **Job**: see below. **Tool**: `transfer_to_human` |
| 7 | **HTTP Request** (on the tool's branch) | **URL**: `{{context.oneix.api}}/voice/flow/calls/{{input.userId}}/handover`<br>**Body**: see below<br>**Store**: Context key `oneix.handover` |
| 8 | **If** `context.oneix.handover.targets.length > 0` | **Then**: **Say** `Connecting you with a colleague now. They'll have everything you told me.`, then the **Code** node `ring agents` (below).<br>**Else**: go to node 9 |
| 9 | **HTTP Request** `…/voice/flow/calls/{{input.userId}}/missed` → **Say** → **Hang Up** | **Say**: `Sorry, all our agents are busy right now. Your reference number is {{context.oneix.start.ticketNumber}}, and we'll get back to you by email. Thanks for calling.` |
| 10 | **HTTP Request** | **URL**: `{{context.oneix.api}}/voice/flow/calls/{{input.userId}}/ended` |

**AI Agent node (6): Job**

- **Job Name**: `Front-line support and handover`
- **Job Description**:
  ```
  Answer the caller's question when it is general information you know. For anything that needs their account, a decision, or a person, collect what happened, when, and any reference number (order, booking, or the last four digits of a card), then transfer them to a human agent with a one-sentence summary.
  ```
- **Instructions and Context**: turn on, then:
  ```
  The caller's name is {{context.oneix.start.firstName}}; you already greeted them.
  Transfer to a human (use transfer_to_human) when:
  - the caller asks for a person, an agent, or a manager;
  - the request needs their account, a refund, a dispute, a cancellation, or an approval;
  - they report fraud, a security concern, or anything urgent;
  - the caller is upset, or you have failed to help twice.
  Before transferring, make sure you know what they need, what happened and when, and any reference number. Ask for what's missing, briefly.
  ```

**Tool `transfer_to_human`** (child of the AI Agent node)

- **Description**: `Transfer the caller to a human agent with a short summary of their request.`
- **Parameter** `reason`, string, required: `One sentence for the human agent: what the caller needs, key details such as reference numbers, and what you already covered.`

**Handover body (node 7)**

```json
{
  "reason": "{{input.aiAgent.toolArgs.reason}}",
  "transcript": { "$cs": { "script": "input.transcript", "type": "object" } }
}
```

Put a **Get Transcript** node right before node 7, with **Limit** 50 and **Store Location** Input, key `transcript`. The `$cs` form inserts the transcript as an object, not as text. oneix also reads it if it arrives as a JSON string or plain text.

The tool's arguments are usually at `input.aiAgent.toolArgs`. Check the exact path in the **Interaction Panel** with debug mode on the first time the tool fires, and adjust the `reason` expression if it differs.

**Code node `ring agents` (in node 8)**

```js
// Rings every available oneix agent at once; the first to answer gets the call.
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

## 6. Endpoint and Click To Call

### 6.1 Create the Endpoint

1. Go to **Deploy > Endpoints** and click **+ New Endpoint**.
2. Select **Voice Gateway**, name it `Web call`, select the Flow `Web call`, and save.

### 6.2 Click To Call integration

In the Endpoint settings:

1. In **Click To Call Embedding HTML**, click **Set Up Click To Call Integration**. Cognigy generates the embedding code and creates an Application in the Voice Gateway portal named `Widget - …`.
2. In **Click To Call Widget Settings**:
   - **Enable Click To Call Widget**: on.
   - **AI Agent Name**: `Adam`.
   - **Tagline**: `Acme Support`.
   - **Display Live Transcription**: on. oneix's landing page shows the captions.
3. In **Data Protection & Analytics**: turn on **Mask Sensitive Logging**.
4. Save.
5. **Copy the Click To Call Endpoint URL.** It's the `endpointUrl` in the generated embedding code. Put it in `.env` as `NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL`.

oneix's landing page doesn't use the generated embedding code. It has its own call widget built on the Click To Call SDK, which only needs this URL.

### 6.3 Check the Application in Voice Gateway

In the Voice Gateway portal, go to **Applications** and open `Widget - …`. Check that speech-to-text and text-to-speech are ElevenLabs. If you added ElevenLabs to the project after generating the integration, add it here too.

### 6.4 Try the AI agent on its own

In the Endpoint settings, click **Open Demo Widget** and talk to Adam.

The oneix requests will fail here, because the demo widget doesn't send a oneix call token. That's expected. The point is to check that Adam hears you, answers, and sounds right.

## 7. Finish oneix's settings

### 7.1 SIP realm and WebSocket URL

Open the Click To Call Endpoint URL from step 6.2 in a browser. It returns JSON. Find `sipConnectivityInfo` and copy:

| JSON field | `.env` variable |
|---|---|
| `sipConnectivityInfo.realm` | `VOICE_SIP_REALM` |
| `sipConnectivityInfo.wsUri` | `VOICE_GATEWAY_WSS_URL` |

The JSON also contains a short-lived password and other values; don't share it.

### 7.2 Check `.env`

```
VOICE_FLOW_SECRET=…                      # already set
VOICE_GATEWAY_WEBHOOK_SECRET=…           # from 3.3
VOICE_SIP_REALM=…                        # from 7.1
VOICE_GATEWAY_WSS_URL=wss://…            # from 7.1
NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL=…   # from 6.2
NEXT_PUBLIC_LANDING_TENANT=con-blinkcx2  # the workspace whose agents take the calls
WIDGET_ORIGINS=http://localhost:3002
```

### 7.3 Restart oneix

Stop `npm start` (Ctrl+C) and run it again, so the API, workspace, and landing page pick up the new values.

## 8. Test, step by step

Test each stage before the next; each one checks a different link.

| # | Do | Expect | If not |
|---|---|---|---|
| 1 | In the workspace (http://localhost:3000), sign in and set **Available for calls**, top right | The dot turns **green** within a few seconds | Amber with "Voice calls aren't set up": `VOICE_SIP_REALM` or `VOICE_GATEWAY_WSS_URL` is missing. Stays amber or "Couldn't connect your phone": check the API log for `softphone registration refused`, and the **Registration Webhook** URL and **Webhook Secret** in 3.3 |
| 2 | Open http://localhost:3002, click **Talk to us**, enter a name and email, tick the box, **Start call** | A ticket number appears, then Adam greets you **by first name** | "Calls aren't set up": `NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL` or `NEXT_PUBLIC_LANDING_TENANT` is missing. Greeting without the name: the start request failed; check the tunnel, the secret, and `input.userId` in the Interaction Panel |
| 3 | In the workspace, open **Live calls** | The call shows **With the AI agent**; the ticket shows the **Call in progress** banner | The start request didn't reach oneix: check node 4's URL and headers |
| 4 | Tell Adam: "I'd like to talk to a person" | Adam says he's connecting you; the ticket gets the **transcript note**; the call shows **Waiting for an agent** | No note: check node 7 and the `reason` and `transcript` expressions |
| 5 | | The workspace **rings**, with the caller and ticket number | Adam says agents are busy: `targets` was empty. Check that you're Available with a green dot. Rings nowhere: see *Known risks* below |
| 6 | Click **Answer and open ticket** | You hear the caller; the ticket opens with the AI conversation, assigned to you | No audio: see *Known risks* |
| 7 | Hang up | The call leaves **Live calls** | |

Useful while testing:

- **Cognigy Interaction Panel** with debug mode: shows each node, `input.userId`, the tool's arguments, and HTTP responses.
- **The API log** (`npm start` output): every request from the Flow and every refused softphone registration.
- **Voice Gateway portal > Recent Calls**: each call leg, SIP status codes, and PCAP traces.

## Known risks

These depend on how Cognigy's Voice Gateway behaves with Click To Call calls, which the documentation doesn't fully cover. Step 8 shows which ones apply.

1. **Ringing browser softphones from a Click To Call call.** Cognigy documents that Click To Call transfers support **only Dial to SIP targets**, through a carrier. oneix rings agents as registered SIP users (`type: "user"`). If step 5 rings nowhere:
   - First try changing the `ring agents` Code node to SIP targets: `target: handover.targets.map((t) => ({ type: "sip", sipUri: "sip:" + t.name }))`.
   - If that fails too, ask Cognigy support how a Click To Call call can be dialed to devices registered on the same account, and whether **Default carrier for WebRTC calls** must be set.
2. **The registration webhook's format.** oneix expects jambonz's format (Voice Gateway is built on jambonz). If registration is refused although the settings are right, the API log shows the request; send it over and the webhook gets adjusted.
3. **Audio through firewalls.** On a corporate network or VPN, a call can connect with no audio. The agent's softphone doesn't use STUN or TURN servers yet; adding configurable ones is a small change.
4. **The call token in the Flow.** oneix sends it as the caller's SIP user, which the Flow reads as `input.userId`. If it arrives elsewhere, change the URLs in nodes 4, 7, 9, and 10.
