/**
 * Builds the oneix website-call setup in Cognigy through its REST API: the AI agent Adam, the
 * "OneIX Web Call" Flow with every node, and the Voice Gateway Endpoint.
 *
 * Node types and their settings are looked up by the names shown in the Flow editor, from Cognigy's
 * own node descriptors. Everything is checked before anything is created: if a node type or setting
 * can't be found, the script stops, removes the empty Flow it made, and writes a report to send over.
 *
 *   npm run cognigy:flow                 build (stops if the Flow already exists)
 *   npm run cognigy:flow -- --replace    delete the existing Flow and build it again
 *   npm run cognigy:flow -- --update     rewrite the existing Flow's Code and If nodes in place (for example
 *                                        after the tunnel address changes); keeps the Flow, so
 *                                        Endpoints pointing at it keep working
 *   npm run cognigy:flow -- --inspect    only write the node descriptors to a file
 *
 * Needs in .env: COGNIGY_API_BASE_URL, COGNIGY_API_KEY, COGNIGY_PROJECT_ID, ONEIX_PUBLIC_API_URL
 * (the forwarded address of port 4000), and VOICE_FLOW_SECRET.
 *
 * Not covered by the API, so done by hand afterwards: the LLM (with its OpenAI key), ElevenLabs in
 * Voice Preview Settings, and the Endpoint's "Set Up Click To Call Integration" button.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    replace: { type: "boolean", default: false },
    update: { type: "boolean", default: false },
    inspect: { type: "boolean", default: false },
    "flow-name": { type: "string", default: "OneIX Web Call" },
    "agent-name": { type: "string", default: "Adam" },
    "endpoint-name": { type: "string", default: "OneIX Web Call" },
  },
});

const env = {
  base: (process.env.COGNIGY_API_BASE_URL ?? "").replace(/\/$/, ""),
  key: process.env.COGNIGY_API_KEY ?? "",
  projectId: process.env.COGNIGY_PROJECT_ID ?? "",
  oneix: (process.env.ONEIX_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
  secret: process.env.VOICE_FLOW_SECRET ?? "",
};
const missing = Object.entries({
  COGNIGY_API_BASE_URL: env.base,
  COGNIGY_API_KEY: env.key,
  COGNIGY_PROJECT_ID: env.projectId,
  ...(args.inspect ? {} : { ONEIX_PUBLIC_API_URL: env.oneix, VOICE_FLOW_SECRET: env.secret }),
})
  .filter(([, value]) => !value)
  .map(([name]) => name);
// Checked before any network call, so exiting here is safe.
if (missing.length > 0) {
  console.error(`\n✖ Missing in .env: ${missing.join(", ")}. See docs/11-voice-setup-guide.md.\n`);
  process.exit(1);
}

const REPORT_FILE = "cognigy-flow-report.json";

// ─── The setup ────────────────────────────────────────────────────────────────────────────────

const AGENT = {
  name: args["agent-name"],
  description:
    "Adam is Acme Support's voice assistant and answers every call first: warm, calm, and efficient. Adam helps customers with orders, billing, and account questions, and when a customer needs a person, gathers the key details so the human agent can pick up without the customer repeating themselves.",
  instructions: [
    "- You are on a phone call; your words become speech.",
    "- Reply in one to three short sentences. Ask one question at a time.",
    "- No lists, markdown, emojis, or URLs.",
    "- Read reference numbers digit by digit.",
    "- If you didn't understand, ask the customer to repeat. Don't guess.",
    "- Never ask for or repeat a full card number, CVV, PIN, password, or one-time code.",
    "- Don't promise refunds, credits, or outcomes. Don't invent account or policy details.",
    "- Stay calm and empathetic if the customer is upset.",
  ].join("\n"),
};

const JOB = {
  name: "Front-line support and handover",
  description:
    "Answer the caller's question when it is general information you know. For anything that needs their account, a decision, or a person, collect what happened, when, and any reference number (order, booking, or the last four digits of a card), then transfer them to a human agent with a one-sentence summary.",
  instructions: [
    "The caller's name is {{context.oneixStart && context.oneixStart.result && context.oneixStart.result.firstName ? context.oneixStart.result.firstName : 'not known'}}. On your first turn, greet them by first name, say you're Adam from Acme Support, and ask how you can help.",
    "Transfer to a human (use transfer_to_human) when:",
    "- the caller asks for a person, an agent, or a manager;",
    "- the request needs their account, a refund, a dispute, a cancellation, or an approval;",
    "- they report fraud, a security concern, or anything urgent;",
    "- the caller is upset, or you have failed to help twice.",
    "Before transferring, make sure you know what they need, what happened and when, and any reference number. Ask for what's missing, briefly.",
  ].join("\n"),
};

const TOOL = {
  id: "transfer_to_human",
  description: "Transfer the caller to a human agent with a short summary of their request.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description:
          "One sentence for the human agent: what the caller needs, key details such as reference numbers, and what you already covered.",
      },
    },
    required: ["reason"],
  },
};

const code = {
  settings: `// oneix: where its API is, and the secret it expects from this Flow.
// Run this script again (or edit here) when the tunnel address changes.
context.oneix = { api: ${JSON.stringify(env.oneix)}, secret: ${JSON.stringify(env.secret)} };

// Voice Gateway tags every input with an event, speech included (RECOGNIZED_SPEECH,
// USER_INPUT_TIMEOUT). Only these go to oneix; everything else goes to Adam.
const CALL_EVENTS = ["CALL_COMPLETED", "CALL_FAILED", "NO_ANSWER", "USER_BUSY", "TRANSFER_DIAL_ERROR", "TRANSFER_REFER_ERROR"];
const data = input.data || {};
const payload = data.payload || {};
const event = data.event || payload.event || null;
context.oneixEvent = CALL_EVENTS.includes(event) ? event : null;

// Once an agent has the call, Voice Gateway still reports the bridge's progress to the Flow. Adam
// must stay quiet then (running him again would dial again and pull the caller out of the bridge),
// so these inputs take the call event branch, which oneix ignores.
if (event === "TRANSFER_DIAL_SUCCESS") context.oneixTransferred = true;
context.oneixQuiet = !!context.oneixTransferred && !context.oneixEvent;
// The agent's side ended: oneix ends the call, and the caller's side is hung up.
context.oneixHangUp = context.oneixQuiet && (payload.dial_call_status || data.dial_call_status) === "completed";
if (context.oneixHangUp) context.oneixEvent = "CALL_COMPLETED";`,

  afterEvent: `// oneix says what a call event means: "busy" when no agent answered.
// An HTTP Request node keeps a successful answer under "result".
const result = (context.oneixEventResult || {}).result || {};
if (result.action === "busy" && result.say) {
  api.say(result.say);
  hangUp();
} else if (context.oneixHangUp) {
  hangUp();
}

// Voice Gateway verbs go out keyed by name, like the Hang Up node's own output.
function hangUp() {
  api.output(null, { _cognigy: { _voiceGateway2: { json: { hangup: { headers: { "X-Reason": "No agent available" } } } } } });
}`,

  ring: `// oneix returns what to tell the caller, and the agents it is ringing.
// An HTTP Request node keeps a successful answer under "result".
const handover = (context.oneixHandover || {}).result || {};
api.say(handover.say || "Sorry, I can't connect you to a colleague right now. Please try again later.");
if (handover.targets && handover.targets.length > 0) {
  // The agent who answers takes the call over directly from the caller's browser, outside Voice
  // Gateway. Until then the caller stays on this call, and Adam stays quiet.
  context.oneixTransferred = true;
} else {
  api.output(null, { _cognigy: { _voiceGateway2: { json: { hangup: { headers: { "X-Reason": "No agent available" } } } } } });
}`,
};

/** The event the Flow reports: the call event, or a bridge update while an agent has the call. */
const CALL_EVENT_VALUE = "{{context.oneixEvent || 'AGENT_ON_CALL'}}";

/**
 * An HTTP Request node to oneix, storing the response in the Context under `contextKey`. `options`
 * overrides settings, such as `timeout` (milliseconds) or `async` (don't wait for the answer).
 */
function oneixRequest(label, path, payload, contextKey, options = {}) {
  return {
    label,
    node: NODES.http,
    settings: {
      url: `{{context.oneix.api}}/voice/flow/calls/{{input.userId}}/${path}`,
      method: "post",
      headers: { Authorization: "Bearer {{context.oneix.secret}}", "Content-Type": "application/json" },
      payloadType: "json",
      payload,
      storeLocation: "context",
      contextKey,
      timeout: 10000,
      ...options,
    },
  };
}

// How each node type and setting is recognized: by internal type or key, else by the editor's label.
const NODES = {
  code: { types: ["code"], labels: ["Code"] },
  if: { types: ["if"], labels: ["If"] },
  http: { types: ["httpRequest"], labels: ["HTTP Request"] },
  aiAgent: { types: ["aiAgentJob"], labels: ["AI Agent"] },
  tool: { types: ["aiAgentJobTool"], labels: ["Tool"], childOf: "aiAgent" },
  getTranscript: { types: ["getTranscript"], labels: ["Get Transcript"] },
};

const FIELDS = {
  code: { code: { keys: ["code"], labels: ["Code"] } },
  if: { condition: { keys: ["condition"], labels: ["Condition"] } },
  http: {
    url: { keys: ["url"], labels: ["URL"] },
    method: {
      keys: ["type", "method"],
      labels: ["Request Method", "Method", "Request Type"],
      matchCaseOfDefault: true,
    },
    headers: { keys: ["headers"], labels: ["Headers"] },
    payloadType: { keys: ["payloadType"], labels: ["Payload Type", "Content Type", "Body Type"] },
    payload: {
      keys: ["payloadJSON", "payload", "jsonPayload", "body"],
      labels: ["JSON", "Payload", "JSON Payload", "Body"],
    },
    storeLocation: {
      keys: ["storeLocation"],
      labels: ["Response Store Location", "Store Location", "Store Response"],
    },
    contextKey: { keys: ["contextKey"], labels: ["Context Key"] },
    timeout: { keys: ["timeout"], labels: ["Timeout"], optional: true },
    async: { keys: ["async"], labels: ["Async"], optional: true },
  },
  aiAgent: {
    agent: { keys: ["aiAgent", "aiAgentId", "agent"], labels: ["AI Agent"] },
    jobName: { keys: ["name", "jobName"], labels: ["Job Name"] },
    jobDescription: { keys: ["description", "jobDescription"], labels: ["Job Description"] },
    instructions: {
      keys: ["instructions", "jobInstructions", "additionalInstructions"],
      labels: ["Instructions", "Instructions and Context"],
    },
  },
  tool: {
    id: { keys: ["toolId", "id", "name"], labels: ["Tool ID", "Tool Name", "Name"] },
    description: { keys: ["description"], labels: ["Description"] },
    useParameters: { keys: ["useParameters"], labels: ["Use Parameters"], optional: true },
    parameters: { keys: ["parameters"], labels: ["Parameters"] },
  },
  getTranscript: {
    limit: { keys: ["limit"], labels: ["Limit"] },
    storeLocation: { keys: ["storeLocation"], labels: ["Store Location"] },
    inputKey: { keys: ["inputKey"], labels: ["Input Key"] },
  },
};

// ─── Run ──────────────────────────────────────────────────────────────────────────────────────

/** The Flow being built, for the node helpers. */
let flow;

// Errors end the run with a message; letting Node finish on its own avoids a Windows crash on exit.
await main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`);
  process.exitCode = 1;
});

async function main() {
  const project = await api("GET", `/v2.0/projects/${env.projectId}`);
  console.log(`Cognigy project: ${project.name ?? env.projectId}`);

  if (args.inspect) {
    const { flowId, created } = await scratchFlow();
    const descriptors = await api("GET", `/v2.0/flows/${flowId}/chart/descriptors`);
    writeFileSync(REPORT_FILE, JSON.stringify({ descriptors: summarize(descriptors.items) }, null, 2));
    if (created) await api("DELETE", `/v2.0/flows/${flowId}`);
    console.log(`\nWrote the node descriptors to ${REPORT_FILE}.`);
    return;
  }

  if (args.update) {
    await updateCodeNodes(args["flow-name"]);
    return;
  }

  // 1. The Flow (created first: node descriptors are read per Flow).
  const flowName = args["flow-name"];
  const existing =
    (
      await api(
        "GET",
        `/v2.0/flows?projectId=${env.projectId}&filter=${encodeURIComponent(flowName)}&limit=100`,
      )
    ).items ?? [];
  const sameName = existing.filter((f) => f.name === flowName);
  if (sameName.length > 0) {
    if (!args.replace)
      fail(`A Flow named "${flowName}" already exists. Run again with --replace to rebuild it.`);
    for (const flow of sameName) await api("DELETE", `/v2.0/flows/${flow._id}`);
    console.log(`Deleted the existing Flow "${flowName}".`);
  }
  flow = await api("POST", "/v2.0/flows", {
    name: flowName,
    projectId: env.projectId,
    description:
      "Website calls: Adam answers, oneix hands over to agents. Built by scripts/cognigy/build-web-call-flow.mjs.",
  });
  console.log(`Created the Flow "${flowName}".`);

  // 2. Check every node type and setting before creating anything.
  const descriptors = (await api("GET", `/v2.0/flows/${flow._id}/chart/descriptors`)).items ?? [];
  const plan = resolveAll(descriptors);
  if (plan.problems.length > 0) {
    await api("DELETE", `/v2.0/flows/${flow._id}`);
    const relevant = summarize(descriptors.filter((d) => plan.consulted.has(d.type)));
    writeFileSync(
      REPORT_FILE,
      JSON.stringify(
        { problems: plan.problems, consulted: relevant, allNodeTypes: summarize(descriptors, false) },
        null,
        2,
      ),
    );
    console.error("\nSome node types or settings couldn't be matched, so nothing was built:");
    for (const problem of plan.problems) console.error(`  - ${problem}`);
    fail(
      `The details are in ${REPORT_FILE}. Send that file over to get the script adjusted. (It contains no secrets.)`,
    );
  }

  // 3. The AI agent.
  const agent = await upsertAgent();

  // 4. The nodes. A branch (Then, Else, a tool) runs the nodes that follow it, so they are
  // appended to it; as its children they would show under it in the editor but never run.
  const chart = await api("GET", `/v2.0/flows/${flow._id}/chart`);
  const start = chart.nodes.find((n) => n.type === "start");
  if (!start) fail("The new Flow has no start node.");

  const settingsNode = await add(
    { label: "oneix: settings and call event", node: NODES.code, settings: { code: code.settings } },
    start._id,
    "append",
  );

  const isEvent = await add(
    { label: "Call event?", node: NODES.if, settings: { condition: ifRules()["Call event?"] } },
    settingsNode.id,
    "append",
  );
  const eventThen = childOf(isEvent, "then");
  const eventElse = childOf(isEvent, "else");

  const eventRequest = await add(
    oneixRequest("oneix: call event", "event", { event: CALL_EVENT_VALUE }, "oneixEventResult"),
    eventThen,
    "append",
  );
  await add(
    { label: "oneix: say busy and hang up", node: NODES.code, settings: { code: code.afterEvent } },
    eventRequest.id,
    "append",
  );

  const firstTurn = await add(
    { label: "First turn?", node: NODES.if, settings: { condition: ifRules()["First turn?"] } },
    eventElse,
    "append",
  );
  await add(
    oneixRequest("oneix: call started", "start", { sessionId: "{{input.sessionId}}" }, "oneixStart"),
    childOf(firstTurn, "then"),
    "append",
  );

  const aiAgentNode = await add(
    {
      label: "Adam",
      node: NODES.aiAgent,
      settings: {
        agent: agent._id,
        jobName: JOB.name,
        jobDescription: JOB.description,
        instructions: JOB.instructions,
      },
    },
    firstTurn.id,
    "append",
  );

  // After each of Adam's turns, the conversation so far goes to oneix, which shows it on the ticket live.
  const liveTranscript = await add(
    {
      label: "Get transcript (live)",
      node: NODES.getTranscript,
      settings: { limit: 50, storeLocation: "input", inputKey: "liveTranscript" },
    },
    aiAgentNode.id,
    "append",
  );
  await add(
    oneixRequest(
      "oneix: transcript",
      "transcript",
      { transcript: { $cs: { script: "input.liveTranscript", type: "object" } } },
      "oneixTranscript",
      { async: true },
    ),
    liveTranscript.id,
    "append",
  );

  // Cognigy adds a sample tool under a new AI Agent node; it becomes transfer_to_human.
  const toolPlan = {
    label: TOOL.id,
    node: NODES.tool,
    settings: {
      id: TOOL.id,
      description: TOOL.description,
      useParameters: true,
      parameters: TOOL.parameters,
    },
  };
  const sampleTool = aiAgentNode.children.find((c) => c.type === NODES.tool.descriptor.type);
  const tool = sampleTool
    ? await update(sampleTool.id, toolPlan)
    : await add(toolPlan, aiAgentNode.id, "appendChild");
  const transcript = await add(
    {
      label: "Get transcript",
      node: NODES.getTranscript,
      settings: { limit: 50, storeLocation: "input", inputKey: "transcript" },
    },
    tool.id,
    "append",
  );
  const handover = await add(
    oneixRequest(
      "oneix: hand over",
      "handover",
      {
        reason: "{{input.aiAgent.toolArgs.reason}}",
        transcript: { $cs: { script: "input.transcript", type: "object" } },
      },
      "oneixHandover",
      // oneix answers at once (the Zendesk note follows), but allow for a slow tunnel.
      { timeout: 20000 },
    ),
    transcript.id,
    "append",
  );
  await add(
    { label: "oneix: ring agents", node: NODES.code, settings: { code: code.ring } },
    handover.id,
    "append",
  );
  console.log("Built the Flow's nodes.");

  // 5. The Voice Gateway Endpoint.
  // Endpoints refer to a Flow by its reference ID (a UUID), not its database ID.
  const endpoint = await upsertEndpoint(flow.referenceId ?? flow._id);

  console.log(`
Done.
  AI agent:  ${agent.name}
  Flow:      ${flowName}
  Endpoint:  ${endpoint?.name ?? "(create it by hand: Deploy > Endpoints > Voice Gateway)"}

By hand in Cognigy, if not done yet (the API doesn't cover these):
  1. Build > LLM: an OpenAI model (gpt-4.1) as the project default.
  2. Manage > Settings > Voice Preview Settings: ElevenLabs.
  3. Deploy > Endpoints > ${args["endpoint-name"]}: click "Set Up Click To Call Integration", turn on the widget, save,
     and copy the endpointUrl into .env as NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL.
Then follow docs/11-voice-setup-guide.md from part 7.`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────

async function api(method, path, body, { soft = false } = {}) {
  let response;
  try {
    response = await fetch(`${env.base}${path}`, {
      method,
      headers: {
        "X-API-Key": env.key,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    fail(`Can't reach Cognigy at ${env.base}: ${error.cause?.code ?? error.message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    const message = `${method} ${path} failed (${response.status}): ${text.slice(0, 600)}`;
    if (soft) {
      console.warn(`  ! ${message}`);
      return null;
    }
    fail(message);
  }
  return text ? JSON.parse(text) : {};
}

/** Any Flow to read descriptors from: an existing one, or a temporary one. */
async function scratchFlow() {
  const flows = (await api("GET", `/v2.0/flows?projectId=${env.projectId}&limit=1`)).items ?? [];
  if (flows.length > 0) return { flowId: flows[0]._id, created: false };
  const flow = await api("POST", "/v2.0/flows", {
    name: "oneix-inspect (temporary)",
    projectId: env.projectId,
  });
  return { flowId: flow._id, created: true };
}

function labelOf(value) {
  if (!value) return "";
  return typeof value === "string" ? value : (value.default ?? value.enUS ?? "");
}

function summarize(items, withFields = true) {
  return items.map((d) => ({
    type: d.type,
    label: labelOf(d.defaultLabel),
    extension: d.extension,
    parentType: d.parentType,
    children: d.dependencies?.children,
    ...(withFields
      ? {
          fields: (d.fields ?? []).map((f) => ({
            key: f.key,
            label: labelOf(f.label),
            type: f.type,
            default: f.defaultValue,
          })),
        }
      : {}),
  }));
}

/** Finds every node type and setting the build needs. */
function resolveAll(items) {
  const problems = [];
  const consulted = new Set();
  const nodes = {};
  for (const [name, spec] of Object.entries(NODES)) {
    const found = findDescriptor(items, spec);
    if (!found) {
      problems.push(
        `node "${spec.labels[0]}": no descriptor with type ${spec.types.join("/")} or label ${spec.labels.join("/")}`,
      );
      continue;
    }
    consulted.add(found.type);
    nodes[name] = found;
    spec.descriptor = found;
    spec.fieldKeys = {};
    for (const [setting, fieldSpec] of Object.entries(FIELDS[name] ?? {})) {
      const field = findField(found, fieldSpec);
      if (field)
        spec.fieldKeys[setting] = {
          key: field.key,
          default: field.defaultValue,
          fieldType: field.type,
          matchCaseOfDefault: fieldSpec.matchCaseOfDefault,
        };
      else if (!fieldSpec.optional) {
        problems.push(
          `node "${labelOf(found.defaultLabel)}" (${found.type}): no field for "${setting}" (tried keys ${fieldSpec.keys.join("/")}, labels ${fieldSpec.labels.join("/")})`,
        );
      }
    }
  }
  return { problems, consulted, nodes };
}

function findDescriptor(items, spec) {
  const byType = items.filter((d) => spec.types.includes(d.type));
  const candidates =
    byType.length > 0
      ? byType
      : items.filter((d) => spec.labels.some((l) => same(labelOf(d.defaultLabel), l)));
  // Prefer Cognigy's basic nodes when several extensions offer the same label.
  return candidates.find((d) => d.extension === "@cognigy/basic-nodes") ?? candidates[0];
}

function findField(descriptor, spec) {
  const fields = descriptor.fields ?? [];
  return (
    fields.find((f) => spec.keys.includes(f.key)) ??
    fields.find((f) => spec.labels.some((l) => same(labelOf(f.label), l)))
  );
}

function same(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * An If condition as JavaScript, evaluated against the input and Context. (A rule with a
 * CognigyScript ternary on the left never matched.)
 */
function ifCondition(script) {
  return { type: "condition", condition: script, rule: { left: "1", operand: "eq", right: "1" } };
}

/** The If nodes the script owns, by label, with their conditions. */
function ifRules() {
  return {
    // Also while an agent has the call: Adam stays out of it.
    "Call event?": ifCondition("!!context.oneixEvent || !!context.oneixQuiet"),
    // oneixStart holds oneix's answer, or the error if the request failed: either way, asked once.
    "First turn?": ifCondition("!context.oneixStart"),
  };
}

/** A node's config from its planned settings, in the form each field stores its value. */
function configOf(planned) {
  const spec = planned.node;
  const config = {};
  for (const [setting, value] of Object.entries(planned.settings ?? {})) {
    const field = spec.fieldKeys[setting];
    if (!field) continue; // An optional setting this node doesn't have.
    if (field.matchCaseOfDefault && typeof value === "string" && typeof field.default === "string") {
      config[field.key] = field.default === field.default.toUpperCase() ? value.toUpperCase() : value;
    } else if (typeof value === "object" && value !== null && typeof field.default === "string") {
      // JSON, key-value, and tool-parameter fields keep their value as JSON text.
      config[field.key] = JSON.stringify(value, null, 2);
    } else {
      config[field.key] = value;
    }
  }
  return config;
}

/** Updates a node Cognigy created by itself, such as the sample tool under an AI Agent node. */
async function update(nodeId, planned) {
  await api("PATCH", `/v2.0/flows/${flow._id}/chart/nodes/${nodeId}`, {
    label: planned.label,
    config: configOf(planned),
  });
  return { id: nodeId, children: [] };
}

/** Creates a node from its planned settings, and returns its id and automatically created children. */
async function add(planned, target, mode) {
  const spec = planned.node;
  const config = configOf(planned);
  const node = await api("POST", `/v2.0/flows/${flow._id}/chart/nodes`, {
    type: spec.descriptor.type,
    extension: spec.descriptor.extension,
    label: planned.label,
    config,
    target,
    mode,
  });
  const children = [];
  if ((spec.descriptor.dependencies?.children ?? []).length > 0) {
    const chartNow = await api("GET", `/v2.0/flows/${flow._id}/chart`);
    const relation = chartNow.relations.find((r) => r.node === node._id);
    for (const childId of relation?.children ?? []) {
      const child = chartNow.nodes.find((n) => n._id === childId);
      if (child) children.push({ id: child._id, type: child.type });
    }
  }
  return { id: node._id, children };
}

function childOf(node, type) {
  const child = node.children.find((c) => c.type === type);
  if (!child)
    fail(
      `Expected a "${type}" branch under a node; found ${node.children.map((c) => c.type).join(", ") || "none"}.`,
    );
  return child.id;
}

/**
 * Creates the AI agent, or brings an existing one with the same name up to date, so running the
 * script again applies changes to Adam too. The voice is set when COGNIGY_TTS_VOICE is given (an
 * ElevenLabs voice ID); otherwise the Endpoint's default voice is used.
 */
async function upsertAgent() {
  const voice = process.env.COGNIGY_TTS_VOICE ?? "";
  const body = {
    name: AGENT.name,
    description: AGENT.description,
    instructions: AGENT.instructions,
    speakingStyle: { completeness: "concise", formality: "formal" },
    enableVoiceConfigs: voice !== "",
    ...(voice
      ? {
          voiceConfigs: {
            ttsVendor: "elevenlabs",
            ttsVoice: voice,
            ttsLanguage: process.env.COGNIGY_TTS_LANGUAGE || "en-US",
            ttsModel: process.env.COGNIGY_TTS_MODEL || "eleven_flash_v2_5",
            ttsDisableCache: false,
          },
        }
      : {}),
    enableAutoLanguageDetection: false,
    contactProfilesOption: "none",
    safetySettings: {
      avoidHarmfulContent: true,
      avoidUngroundedContent: true,
      avoidCopyrightInfringements: true,
      preventJailbreakAndManipulation: true,
    },
    projectId: env.projectId,
  };
  const agents = (await api("GET", `/v2.0/aiagents?projectId=${env.projectId}&limit=100`)).items ?? [];
  const found = agents.find((a) => a.name === AGENT.name);
  if (found) {
    const { projectId: _projectId, ...changes } = body;
    await api("PATCH", `/v2.0/aiagents/${found._id}`, changes);
    console.log(`Updated the existing AI agent "${AGENT.name}".`);
    return found;
  }
  const created = await api("POST", "/v2.0/aiagents", body);
  console.log(`Created the AI agent "${AGENT.name}".`);
  return created;
}

async function upsertEndpoint(flowId) {
  const name = args["endpoint-name"];
  const endpoints = (await api("GET", `/v2.0/endpoints?projectId=${env.projectId}&limit=100`)).items ?? [];
  const found = endpoints.find((e) => e.name === name);
  // The Flow is built either way; an Endpoint that can't be created is made by hand.
  if (found) {
    const updated = await api("PATCH", `/v2.0/endpoints/${found._id}`, { flowId }, { soft: true });
    if (updated) console.log(`Pointed the existing Endpoint "${name}" at the new Flow.`);
    return updated ? found : null;
  }
  const created = await api(
    "POST",
    "/v2.0/endpoints",
    { projectId: env.projectId, name, channel: "voiceGateway2", flowId, active: true, maskLogging: true },
    { soft: true },
  );
  if (created) console.log(`Created the Voice Gateway Endpoint "${name}".`);
  return created;
}

function fail(message) {
  throw new Error(message);
}

/** Rewrites the existing Flow's Code nodes in place, keeping the Flow and its Endpoints. */
async function updateCodeNodes(flowName) {
  // The Code nodes the script owns, by label.
  const CODE_NODES = {
    "oneix: settings and call event": code.settings,
    "oneix: say busy and hang up": code.afterEvent,
    "oneix: ring agents": code.ring,
  };
  const flows = (await api("GET", `/v2.0/flows?projectId=${env.projectId}&limit=100`)).items ?? [];
  const target = flows.find((f) => f.name === flowName);
  if (!target) fail(`No Flow named "${flowName}" to update. Build it first with npm run cognigy:flow.`);
  const chart = await api("GET", `/v2.0/flows/${target._id}/chart`);
  let updated = 0;
  const rules = ifRules();
  // Other settings the script keeps current, by node label.
  const SETTINGS = {
    "oneix: call event": { payloadJSON: JSON.stringify({ event: CALL_EVENT_VALUE }, null, 2) },
    Adam: { instructions: JOB.instructions },
    "oneix: hand over": { timeout: 20000 },
  };
  for (const node of chart.nodes) {
    if (SETTINGS[node.label]) {
      await api("PATCH", `/v2.0/flows/${target._id}/chart/nodes/${node._id}`, { config: SETTINGS[node.label] });
      console.log(`Updated the node "${node.label}".`);
      updated++;
      continue;
    }
    if (node.type === "if" && rules[node.label]) {
      await api("PATCH", `/v2.0/flows/${target._id}/chart/nodes/${node._id}`, {
        config: { condition: rules[node.label] },
      });
      console.log(`Updated the If node "${node.label}".`);
      updated++;
      continue;
    }
    const nodeCode = CODE_NODES[node.label];
    if (node.type !== "code" || !nodeCode) continue;
    await api("PATCH", `/v2.0/flows/${target._id}/chart/nodes/${node._id}`, { config: { code: nodeCode } });
    console.log(`Updated the Code node "${node.label}".`);
    updated++;
  }
  if (updated === 0)
    fail(`The Flow "${flowName}" has none of the script's Code nodes. Rebuild it with --replace.`);
  console.log(`\nDone: ${updated} nodes updated in "${flowName}".`);
}
