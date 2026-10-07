import { describe, expect, it, vi } from "vitest";
import { TicketingError } from "../errors.js";
import { ZendeskProvider } from "./provider.js";
import type { ZendeskTicket, ZendeskUser } from "./types.js";

const customer: ZendeskUser = { id: 10, name: "Casey Customer", email: "casey@example.com", phone: null, role: "end-user" };
const agent: ZendeskUser = { id: 20, name: "Sam Agent", email: "sam@oneix.local", phone: null, role: "agent" };

const ticket: ZendeskTicket = {
  id: 1001,
  subject: "Broken invoice",
  status: "hold",
  priority: "high",
  requester_id: 10,
  assignee_id: 20,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

/** Fake fetch that answers by "METHOD /path" and records every call. */
function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? "GET",
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const handler = routes[`${call.method} ${url.pathname}`];
    if (!handler) return new Response("not found", { status: 404 });
    return handler(call);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tokenRoute = { "POST /oauth/tokens": () => json({ access_token: "tok", expires_in: 3600 }) };

function provider(routes: Record<string, (call: Call) => Response>, impersonate = false) {
  const fake = fakeFetch({ ...tokenRoute, ...routes });
  const zendesk = new ZendeskProvider({
    subdomain: "acme",
    clientId: "id",
    clientSecret: "secret",
    impersonate,
    fetch: fake.fetch,
  });
  return { zendesk, calls: fake.calls };
}

describe("ZendeskProvider", () => {
  it("maps a ticket with its requester to the neutral shape", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/tickets/1001.json": () => json({ ticket, users: [customer, agent] }),
    });

    const result = await zendesk.getTicket("1001");

    expect(result).toEqual({
      externalId: "1001",
      subject: "Broken invoice",
      status: "on_hold",
      priority: "high",
      requester: { externalId: "10", name: "Casey Customer", email: "casey@example.com", phone: null },
      assigneeExternalId: "20",
      createdAt: new Date("2026-10-01T10:00:00Z"),
      updatedAt: new Date("2026-10-02T10:00:00Z"),
      deleted: false,
    });
    expect(calls[0]?.body).toMatchObject({ grant_type: "client_credentials", client_id: "id" });
    expect(calls[1]?.headers.Authorization).toBe("Bearer tok");
  });

  it("returns null for a missing ticket", async () => {
    const { zendesk } = provider({});
    expect(await zendesk.getTicket("404")).toBeNull();
  });

  it("rejects non-numeric ticket IDs before calling the backend", async () => {
    const { zendesk, calls } = provider({});
    await expect(zendesk.getTicket("../users")).rejects.toThrow("Invalid ticket ID");
    expect(calls).toHaveLength(0);
  });

  it("sends status in the backend's vocabulary and loads the requester", async () => {
    const { zendesk, calls } = provider({
      "PUT /api/v2/tickets/1001.json": () => json({ ticket: { ...ticket, status: "hold", assignee_id: null } }),
      "GET /api/v2/users/show_many.json": () => json({ users: [customer] }),
    });

    const result = await zendesk.updateTicket(
      "1001",
      { status: "on_hold", assigneeExternalId: null },
      { email: "sam@oneix.local", externalUserId: "20" },
    );

    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({ ticket: { status: "hold", assignee_id: null } });
    expect(put?.headers["X-On-Behalf-Of"]).toBeUndefined();
    expect(result.requester?.name).toBe("Casey Customer");
    expect(result.assigneeExternalId).toBeNull();
  });

  it("attributes notes through author_id without impersonation", async () => {
    const { zendesk, calls } = provider({ "PUT /api/v2/tickets/1001.json": () => json({ ticket }) });

    await zendesk.addNote("1001", { body: "Called the customer" }, { email: "sam@oneix.local", externalUserId: "20" });

    expect(calls.at(-1)?.body).toEqual({
      ticket: { comment: { body: "Called the customer", public: false, author_id: 20 } },
    });
  });

  it("acts on behalf of the agent when impersonation is enabled", async () => {
    const { zendesk, calls } = provider({ "PUT /api/v2/tickets/1001.json": () => json({ ticket }) }, true);

    await zendesk.addNote("1001", { body: "Note" }, { email: "sam@oneix.local", externalUserId: "20" });

    expect(calls[0]?.body).toMatchObject({ scope: "read write impersonate" });
    expect(calls.at(-1)?.headers["X-On-Behalf-Of"]).toBe("sam@oneix.local");
    expect(calls.at(-1)?.body).toEqual({ ticket: { comment: { body: "Note", public: false } } });
  });

  it("reads every page of the thread and labels authors", async () => {
    const { zendesk } = provider({
      "GET /api/v2/tickets/1001/comments.json": (call) =>
        call.url.searchParams.get("page[after]") === "c2"
          ? json({
              comments: [{ id: 3, body: "Thanks", public: true, author_id: 10, created_at: "2026-10-02T10:00:00Z" }],
              users: [customer],
              meta: { has_more: false, after_cursor: null },
            })
          : json({
              comments: [
                { id: 1, body: "<p>Help</p>", plain_body: "Help", public: true, author_id: 10, created_at: "2026-10-01T10:00:00Z" },
                { id: 2, body: "Checking", public: false, author_id: 20, created_at: "2026-10-01T11:00:00Z" },
              ],
              users: [customer, agent],
              meta: { has_more: true, after_cursor: "c2" },
            }),
    });

    const thread = await zendesk.getThread("1001");

    expect(thread.map((c) => [c.body, c.public, c.author.type])).toEqual([
      ["Help", true, "customer"],
      ["Checking", false, "agent"],
      ["Thanks", true, "customer"],
    ]);
  });

  it("pages the incremental export with end_time as the cursor", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/incremental/tickets.json": () =>
        json({ tickets: [ticket, { ...ticket, id: 1002, status: "deleted" }], users: [customer], end_time: 1760000000, end_of_stream: true }),
    });

    const page = await zendesk.listTickets({ updatedSince: new Date("2026-10-01T00:00:00Z") });

    expect(calls.at(-1)?.url.searchParams.get("start_time")).toBe(String(Date.parse("2026-10-01T00:00:00Z") / 1000));
    expect(page.nextCursor).toBe("1760000000");
    expect(page.endOfStream).toBe(true);
    expect(page.tickets.map((t) => [t.externalId, t.deleted])).toEqual([
      ["1001", false],
      ["1002", true],
    ]);
  });

  it("raises a retryable error on rate limits it cannot wait out", async () => {
    const { zendesk } = provider({
      "GET /api/v2/tickets/1001.json": () => new Response("slow down", { status: 429, headers: { "Retry-After": "60" } }),
    });

    const error = await zendesk.getTicket("1001").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TicketingError);
    expect(error).toMatchObject({ status: 429, retryable: true, retryAfterMs: 60_000 });
  });

  it("refreshes the token once when it is rejected", async () => {
    let tokenCalls = 0;
    let ticketCalls = 0;
    const { zendesk } = provider({
      "POST /oauth/tokens": () => json({ access_token: `tok${++tokenCalls}` }),
      "GET /api/v2/tickets/1001.json": (call) => {
        ticketCalls++;
        return call.headers.Authorization === "Bearer tok2" ? json({ ticket, users: [] }) : json({}, 401);
      },
    });

    expect(await zendesk.getTicket("1001")).not.toBeNull();
    expect(tokenCalls).toBe(2);
    expect(ticketCalls).toBe(2);
  });
});
