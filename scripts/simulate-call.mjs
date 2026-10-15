/**
 * Plays the Cognigy Flow's part of a website call, so the oneix side can be tested without
 * Cognigy: the website starts the call, the AI agent answers, hands over with a transcript, and
 * the call ends. Watch the workspace while it runs: Live calls, the ticket banner, and the note.
 *
 * Creates a real ticket in the workspace's Zendesk.
 *
 *   npm run voice:simulate -- [--name "Jane Cruz"] [--email jane@example.com] [--tenant slug] [--pause 10]
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "Test Caller" },
    email: { type: "string", default: "test.caller@example.com" },
    tenant: { type: "string", default: process.env.NEXT_PUBLIC_LANDING_TENANT || process.env.DEV_TENANT_SLUG || "" },
    pause: { type: "string", default: "10" },
    api: { type: "string", default: `http://localhost:${process.env.API_PORT || 4000}` },
  },
});

const secret = process.env.VOICE_FLOW_SECRET;
const pause = Number(values.pause) * 1000;
const origin = (process.env.WIDGET_ORIGINS || "http://localhost:3002").split(",")[0].trim();

if (!secret) fail("VOICE_FLOW_SECRET is missing from .env.");
if (!values.tenant) fail("No workspace: pass --tenant <slug> or set NEXT_PUBLIC_LANDING_TENANT in .env.");

const transcript = [
  { role: "assistant", payload: { text: `Hi ${values.name.split(" ")[0]}, thanks for calling Acme. I'm Adam. How can I help?` } },
  { role: "user", text: "My card payment was declined twice today, and I was still charged." },
  { role: "assistant", payload: { text: "I'm sorry about that. Can you tell me the last four digits of the card?" } },
  { role: "user", text: "It ends in 4417. Can I talk to a person, please?" },
  { role: "assistant", payload: { text: "Of course. I'm connecting you with a colleague now. They'll have everything you told me." } },
];

step(1, `The website starts a call for ${values.name} <${values.email}>`);
const call = await post("/widget/calls", { tenant: values.tenant, name: values.name, email: values.email }, { Origin: origin });
console.log(`   Ticket #${call.ticketNumber} created. Call token: ${call.callToken}`);
const flow = `/voice/flow/calls/${call.callToken}`;

step(2, "The AI agent answers");
const started = await post(`${flow}/start`, { sessionId: "simulated" }, { Authorization: `Bearer ${secret}` });
console.log(`   Adam greets ${started.firstName}.`);
console.log(`   Look now: Live calls shows the call "With the AI agent", and ticket #${call.ticketNumber} has the banner.`);
await wait();

step(3, "The caller asks for a person; the AI agent hands over");
const handover = await post(
  `${flow}/handover`,
  { reason: "Card payment declined twice but charged; card ending 4417. Asked for a person.", transcript },
  { Authorization: `Bearer ${secret}` },
);
console.log(`   The transcript is on ticket #${call.ticketNumber} as an internal note.`);
console.log(
  handover.targets.length > 0
    ? `   Voice Gateway would ring ${handover.targets.length} available agent(s): ${handover.targets.map((t) => t.name).join(", ")}`
    : "   No agent would ring: nobody is Available with a connected phone (expected until Voice Gateway is set up).",
);
console.log("   Look now: the call shows \"Waiting for an agent\".");
await wait();

step(4, "The call ends");
await post(`${flow}/ended`, {}, { Authorization: `Bearer ${secret}` });
console.log("   The call leaves Live calls.\n");
console.log(`Done. Open ticket #${call.ticketNumber} in the workspace to see the notes.`);

async function post(path, body, headers = {}) {
  let response;
  try {
    response = await fetch(`${values.api}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    fail(`Can't reach the API at ${values.api}. Is oneix running (npm start)?`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${path} failed (${response.status}): ${data.message ?? "no details"}`);
  return data;
}

function step(n, text) {
  console.log(`\n${n}. ${text}`);
}

function wait() {
  console.log(`   (next step in ${pause / 1000} seconds)`);
  return new Promise((resolve) => setTimeout(resolve, pause));
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
