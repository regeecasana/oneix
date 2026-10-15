# Voice architecture

How oneix adds voice, in three phases:

1. **Voice AI, live transcription into the ticket, and seamless handover** to a human agent.
2. **Live voice translation and PII redaction.**
3. **Voice authentication.**

The first slice is built: website calls through Cognigy Click To Call, answered by the AI agent and handed over to agents in oneix. See [10-voice-mvp.md](10-voice-mvp.md).

## The stack

| Layer | Platform | Role |
|---|---|---|
| Voice AI | **NiCE Cognigy** with **Voice Gateway** | Answers every call, runs the AI agent Flow, transcribes, transfers |
| Speech | **ElevenLabs** | Speech-to-text and text-to-speech in Voice Gateway, and the interpreter's voices |
| Human agents | **NiCE CXone** | Telephony, ACD routing and queues, the agent softphone, call recording, voice biometrics |
| Tickets | **Zendesk** | System of record for every call |
| Summaries | **OpenAI GPT** | Call summary and outcome |
| Orchestration and workspace | **oneix** | Creates the ticket, keeps the live transcript, redacts PII, writes back to Zendesk, shows agents the ticket |

Cognigy and CXone do the telephony and the AI. oneix ties a call to its ticket and keeps everything an agent needs on that ticket, live.

## What each platform covers, and the gaps

| Need | Covered by | Gap oneix closes |
|---|---|---|
| Voice AI agent | Cognigy Flow on Voice Gateway, ElevenLabs speech. **Click To Call** for browser calls | None |
| Transcript of the AI part | Each turn is known in the Flow; **Endpoint Transformers** run on every input and output | Getting each turn to oneix as it happens |
| Transcript after handover | Voice Gateway **Transcribe** on a **Dial** transfer (both sides), or CXone **Agent Assist Hub** streaming the call to Cognigy | Storing it, showing it live on the ticket, writing it to Zendesk |
| Handover | Voice Gateway **Transfer** to CXone with SIP headers (**Enable Copilot** sets a UUI value); CXone routes to an agent | Opening the right ticket for the agent who takes the call |
| Routing, softphone, recording | **CXone** ACD, CXone Agent, CXone recording | None |
| Translation | Cognigy **Real-Time Translation** for the AI agent in voice; for human agents, **text only**. Transcribe's `translationHook` for translated text | Spoken translation between a customer and a human agent |
| PII | Cognigy **Data Redaction** for Cognigy's logs and analytics only; Voice Gateway pauses recording and transcription; CXone recording pause | Transcripts reach oneix unredacted; everything oneix stores or writes to Zendesk must be redacted |
| Voice authentication | **NICE Real-Time Authentication** through CXone **Voice Biometrics Hub** | Enrollment consent, the result on the ticket, and the result back in the Cognigy Flow |

## Call path: two options, decide with NICE

**Option A, Cognigy in front (recommended for phase 1).** Phone numbers sit on Voice Gateway. Every call starts with the AI agent. On handover, the Transfer node **dials** CXone and Voice Gateway stays in the media path, so it keeps transcribing both sides. This path is documented end to end in Cognigy's docs.

**Option B, CXone in front.** Phone numbers sit on CXone. A CXone Studio script sends the call to the Cognigy voice agent through **Virtual Agent Hub**, and back to the ACD on escalation. Transcription after handover comes from **Agent Assist Hub** streaming the call to Cognigy (the NiCE CXone AAH endpoint). This is NICE's native path when Cognigy runs as part of CXone, and suits clients whose numbers already live on CXone.

The rest of oneix is the same either way: it receives turns and transcript lines, keys them to the call and ticket, and the agent's screen opens the ticket. The choice depends on where the client's numbers live and how Cognigy is deployed in our CXone tenancy, which NICE confirms.

## Architecture (option A)

```
                     ┌───────────────── NiCE Cognigy ─────────────────┐
 Phone ─ carrier ──► │ Voice Gateway (ElevenLabs speech) ──► AI Flow   │
 Web ─ Click To Call►│   Transcribe (both sides)   Transformers: turns │
                     │   Transfer (Dial) + UUI: call ID, ticket number │
                     └──────│──────────────────────│──────────│────────┘
                            │ transcript lines      │ turns    │ SIP
                            ▼                       ▼          ▼
┌──────────────────────── oneix ───────────────────────┐   ┌──── NiCE CXone ────┐
│ API /voice: calls, turns, transcripts, events         │   │ Studio script:     │
│  ├─ Privacy service (Presidio): redact before storing │   │  read UUI, route   │
│  ├─ Redis Streams ─► SSE ─► ticket view, live          │◄──│  screen pop        │
│  └─ PostgreSQL: calls, transcript segments, auth       │   │  /tickets/{number} │
│ Worker: GPT summary, Zendesk note, retention           │   │ ACD ─► CXone Agent │
│ Media service (phase 2): interpreter                   │   │ Recording          │
└───────────────────────────┬───────────────────────────┘   │ Voice Biometrics   │
                            ▼                               │ Hub (phase 3)      │
            Zendesk: ticket, internal note, fields           └────────────────────┘
```

## Technology choices

| Area | Choice | Notes |
|---|---|---|
| Speech-to-text | **ElevenLabs** in Voice Gateway (`stt_model_id`), multilingual | Used for the AI agent and for transcription after handover |
| Text-to-speech | **ElevenLabs** in Voice Gateway: **Flash v2.5** for low latency in conversation, **Multilingual v2** or **v3** where quality matters | Custom and cloned voices through the ElevenLabs API; cloning a person's voice needs their consent |
| Summary and outcome | **OpenAI GPT**, through the OpenAI API or Azure OpenAI where a client needs regional data residency | Runs on the redacted transcript of the whole call. Produces the summary, the outcome, and suggested ticket fields |
| Human agent desktop | **CXone Agent** for the call (softphone, state, disposition) and **oneix** for the ticket. The Studio script screen-pops `/tickets/{number}` | Later: embed CXone Agent in oneix, or control it with the CXone Agent APIs, so agents use one screen |
| Routing and queues | **CXone ACD**, skills set in Studio | oneix doesn't route calls |
| Recording | **CXone recording** for the agent part; Voice Gateway recording for the AI part if needed | The ticket links to both |
| Live updates to oneix agents | **Server-Sent Events** from the API, fanned out with **Redis Streams** | Agents act through the REST API; a reconnecting browser catches up from the stream |
| Writing to the ticket | Live lines in PostgreSQL. At the end, **one internal note** with the redacted transcript and the GPT summary, plus fields: duration, language, verified, outcome | Zendesk rate limits, and Zendesk comments can't be edited |
| PII redaction | **Microsoft Presidio** (open source: patterns and named-entity recognition, many languages) on every line before storage. Plus: Voice Gateway and CXone pause recording and transcription while a card number is taken by keypad; Cognigy Data Redaction for Cognigy's logs; the Zendesk redaction API for corrections | Raw text never leaves a short-lived Redis buffer |
| Translation, text | Cognigy **Real-Time Translation** with **DeepL** (or Google or Microsoft, the providers Cognigy supports) for the AI agent; the same provider for the agent's subtitles in oneix | Subtitles take around 300 ms |
| Translation, speech to speech | An **interpreter media service** in the call path: ElevenLabs speech-to-text, DeepL translation, ElevenLabs text-to-speech, in both directions | Prove it in phase 2. Ask NICE first whether CXone offers live voice translation natively. Expect 1 to 2 seconds of delay |
| Voice authentication | **NICE Real-Time Authentication** through CXone **Voice Biometrics Hub**. The result reaches the Cognigy Flow (Inject API) and the oneix ticket | Pindrop or Phonexia only if a client needs a provider NICE doesn't offer |
| Webhook security | A per-tenant secret in each webhook URL, an **IP allowlist** of Cognigy's published ranges, and checks that the session and call IDs match a known call | Voice Gateway hooks can't sign requests |
| Observability | **OpenTelemetry** (Voice Gateway emits traces) into Grafana, with latency dashboards | Most voice problems are latency problems |

## Key flows (option A)

### 1. A call starts

1. Voice Gateway answers and the Flow starts.
2. The Flow calls `POST /voice/calls` with the Cognigy session ID, the Voice Gateway call ID, and the caller's number.
3. oneix finds the customer in Zendesk by phone number (or creates one), creates the ticket on the voice channel, and returns its number.
4. The Flow keeps the ticket number for the rest of the call.

### 2. During the AI part

The Endpoint Transformers post each turn to oneix. Each turn is redacted, stored, and streamed, so the conversation builds up live on the ticket.

### 3. Handover to CXone

1. The Flow asks GPT (or calls oneix) for a handover summary and posts it with the reason to `POST /voice/calls/:id/handover`.
2. The Transfer node **dials** CXone with **Enable Copilot** and a UUI header carrying the call ID and ticket number, and transcription on for both sides.
3. The CXone Studio script reads the UUI, routes the call to a skill, and screen-pops `/tickets/{number}` for the agent who answers.
4. The agent sees the ticket with the AI conversation and the summary already there, and the transcript keeps going.

### 4. After handover

Voice Gateway posts each transcript line to oneix, which redacts, stores, and streams it. In phase 2, translated subtitles appear under each line. In phase 3, Voice Biometrics Hub verifies the caller and oneix shows the result.

### 5. The call ends

1. The call-completed event reaches oneix.
2. The worker runs GPT on the redacted transcript, writes one internal note (transcript and summary), sets the fields, links the recordings, and sets the status.
3. Retention jobs delete raw buffers on schedule.

## Data model additions

| Entity | Fields |
|---|---|
| `VoiceCall` | Tenant, Cognigy session, Voice Gateway call ID, CXone contact ID, ticket, customer phone, state (`ai`, `queued`, `agent`, `ended`), agent, language, recordings, timestamps |
| `TranscriptSegment` | Call, sequence, speaker (`customer`, `ai`, `agent`), **redacted text only**, language, translation, start and end time, final or partial |
| `VoiceAuthResult` (phase 3) | Call, provider, score, outcome, enrollment and consent reference |
| `TenantMembership` | Add the agent's CXone agent ID, so a CXone contact maps to the oneix account and its Zendesk user |

## Build order

### Phase 1: about 6 to 8 weeks

- The voice module and data model.
- Transformer and transcription webhooks.
- The live transcript over Server-Sent Events.
- Presidio redaction, from day one, since transcripts contain PII.
- Transfer to CXone with the UUI header; the Studio script and the screen pop.
- Mapping CXone agents to oneix accounts.
- The end-of-call note and GPT summary.
- Testing through Click To Call first, then a phone number.

### Phase 2

- Translated subtitles for the agent.
- The speech-to-speech interpreter, after a latency proof on real calls.
- Pausing recording and transcription for payments; recording retention.

### Phase 3

- NICE Real-Time Authentication through Voice Biometrics Hub.
- Enrollment with recorded consent.
- A verified badge on the ticket, and the result back in the Cognigy Flow.

## Risks to settle early

- **Call path.** Option A or B per client, depending on where numbers live and how Cognigy is deployed in our CXone tenancy.
- **Speaker attribution.** Confirm what Voice Gateway's transcription webhook sends. If it doesn't say who spoke, transcribe each side separately.
- **Data residency.** Cognigy, CXone, ElevenLabs, OpenAI, and Zendesk regions must match each client's contract. Azure OpenAI covers regional needs for summaries.
- **Biometric consent.** Voiceprints are biometric data under GDPR, Illinois BIPA, and the Philippine Data Privacy Act. Legal approves the consent script before phase 3.
- **Translation latency.** Human-to-human translation needs under 2 seconds round trip. Prove it before committing.

## Open questions

For NICE:

1. Is our Cognigy deployed as part of CXone (integrated), and which call path does NICE recommend for us?
2. Does CXone offer live voice translation for agent calls?
3. Is Voice Biometrics Hub with NICE Real-Time Authentication available in our CXone tenancy, and what does enrollment need?
4. Can CXone Agent be embedded in a custom workspace such as oneix, or controlled through the Agent APIs?

For Cognigy:

5. What does the transcription webhook's payload contain, and does it identify the speaker?
6. Does our organization have Voice Gateway, a phone number or carrier, and Click To Call, with ElevenLabs configured?

## Sources

- Cognigy: [Voice Gateway](https://docs.cognigy.com/voice-gateway), [technical capabilities](https://docs.cognigy.com/voice-gateway/technical-capabilities.md), [speech vendors](https://docs.cognigy.com/voice-gateway/references/tts-and-stt-vendors.md), [Transcribe verb](https://docs.cognigy.com/voice-gateway/references/verbs/transcribe.md), [Dial verb](https://docs.cognigy.com/voice-gateway/references/verbs/dial.md), [Transfer node](https://docs.cognigy.com/ai/agents/develop/node-reference/voice/voice-gateway/transfer.md)
- Cognigy and CXone: [NiCE CXone handover](https://docs.cognigy.com/ai/escalate/handover-reference/nice-cxone/overview.md), [integrated handover](https://docs.cognigy.com/ai/escalate/handover-reference/nice-cxone/nice-cxone-integrated.md), [Voice Copilot endpoint](https://docs.cognigy.com/ai/agents/deploy/endpoint-reference/voice-copilot.md), [NiCE CXone AAH endpoint](https://docs.cognigy.com/ai/agents/deploy/endpoint-reference/nice-aah.md), [Inject and Notify API](https://docs.cognigy.com/ai/agents/deploy/endpoints/inject-and-notify.md)
- Cognigy privacy and translation: [Real-Time Translation](https://docs.cognigy.com/ai/platform-features/translation-and-localization/real-time-translation.md), [Data Redaction](https://docs.cognigy.com/ai/platform-features/data-redaction.md), [Data Protection & Analytics](https://docs.cognigy.com/ai/agents/deploy/endpoints/data-protection-and-analytics.md)
- NICE: [CXone: Cognigy AI and voice biometrics](https://help.nicecxone.com/Content/aiassistantsandbots/virtualagenthub/cognigy.htm), [Agent Embedded CRM integration](https://help.nicecxone.com/content/agent/agentapplicationadministration/cxoneagentembedded/crmintegration/integrateyourcrmwithcxae.htm), [NICE Real-Time Authentication](https://www.nice.com/websites/prepared-agents-wem/files/NICE-Real-Time-Authentication.pdf)
