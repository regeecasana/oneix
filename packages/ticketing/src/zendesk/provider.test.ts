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
const usersRoute = {
  "GET /api/v2/users/show_many.json": () => json({ users: [customer] }),
  "GET /api/v2/group_memberships.json": () => json({ group_memberships: [], meta: { has_more: false } }),
};
const putOf = (calls: Call[]) => calls.find((c) => c.method === "PUT");

function provider(routes: Record<string, (call: Call) => Response>, impersonate = false) {
  const fake = fakeFetch({ ...tokenRoute, ...usersRoute, ...routes });
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
      number: 1001,
      subject: "Broken invoice",
      status: "on_hold",
      priority: "high",
      requester: { externalId: "10", name: "Casey Customer", email: "casey@example.com", phone: null },
      assigneeExternalId: "20",
      groupExternalId: null,
      organizationExternalId: null,
      channel: "other",
      channelDetail: null,
      formExternalId: null,
      brandExternalId: null,
      customFields: {},
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

  it("reads the ticket's form, brand, and non-empty custom field values", async () => {
    const { zendesk } = provider({
      "GET /api/v2/tickets/1001.json": () =>
        json({
          ticket: {
            ...ticket,
            ticket_form_id: 500,
            brand_id: 7,
            custom_fields: [
              { id: 1, value: "phones" },
              { id: 2, value: null },
              { id: 3, value: false },
              { id: 4, value: [] },
              { id: 5, value: ["a", "b"] },
              { id: 6, value: true },
            ],
          },
          users: [customer],
        }),
    });

    const result = await zendesk.getTicket("1001");

    expect(result?.formExternalId).toBe("500");
    expect(result?.brandExternalId).toBe("7");
    expect(result?.customFields).toEqual({ "1": "phones", "5": ["a", "b"], "6": true });
  });

  it("changes the form and custom fields in one update", async () => {
    const { zendesk, calls } = provider({
      "PUT /api/v2/tickets/1001.json": () => json({ ticket }),
    });

    await zendesk.updateTicket("1001", { formExternalId: "500", customFields: { "1": "phones", "2": null } });

    expect(putOf(calls)?.body).toEqual({
      ticket: {
        ticket_form_id: 500,
        custom_fields: [
          { id: 1, value: "phones" },
          { id: 2, value: null },
        ],
      },
    });
  });

  it("reads custom fields across pages, leaving out built-in fields", async () => {
    const { zendesk } = provider({
      "GET /api/v2/ticket_fields.json": (call) =>
        call.url.searchParams.get("page[after]")
          ? json({
              ticket_fields: [
                { id: 3, type: "partialcreditcard", title: "Card", position: 3, active: true, required: false, removable: true },
              ],
              meta: { has_more: false, after_cursor: null },
            })
          : json({
              ticket_fields: [
                { id: 1, type: "status", title: "Status", position: 0, active: true, required: false, removable: false },
                {
                  id: 2,
                  type: "tagger",
                  title: "Category",
                  agent_description: "What it's about",
                  position: 1,
                  active: true,
                  required: true,
                  agent_can_edit: false,
                  removable: true,
                  custom_field_options: [
                    { name: "Refund::Pending", value: "refund_pending", allow_solving: false },
                    { name: "Other", value: "other" },
                  ],
                },
              ],
              meta: { has_more: true, after_cursor: "next" },
            }),
    });

    const fields = await zendesk.listTicketFields();

    expect(fields.map((f) => [f.id, f.type])).toEqual([
      ["2", "dropdown"],
      ["3", "credit_card"],
    ]);
    expect(fields[0]).toMatchObject({
      description: "What it's about",
      requiredOn: ["solved"],
      editable: false,
      options: [
        { name: "Refund::Pending", value: "refund_pending", allowSolving: false },
        { name: "Other", value: "other", allowSolving: true },
      ],
    });
  });

  it("reads forms with their brands and when conditional fields are required", async () => {
    const { zendesk } = provider({
      "GET /api/v2/ticket_forms.json": () =>
        json({
          ticket_forms: [
            {
              id: 500,
              name: "Support",
              position: 1,
              active: true,
              default: false,
              in_all_brands: false,
              restricted_brand_ids: [7],
              ticket_field_ids: [1, 2, 3],
              agent_conditions: [
                {
                  parent_field_id: 2,
                  value: "incident",
                  child_fields: [
                    { id: 3, required_on_statuses: { type: "SOME_STATUSES", statuses: ["pending", "hold"] } },
                    { id: 4, required_on_statuses: { type: "ALL_STATUSES" } },
                    { id: 5, is_required: true },
                    { id: 6, required_on_statuses: { type: "NO_STATUSES" } },
                  ],
                },
              ],
            },
            { id: 501, name: "Everyone", position: 0, active: true, default: true, in_all_brands: true, ticket_field_ids: [] },
          ],
        }),
    });

    const [support, everyone] = await zendesk.listTicketForms();

    expect(support).toMatchObject({ id: "500", brandIds: ["7"], fieldIds: ["1", "2", "3"], isDefault: false });
    expect(support?.conditions[0]?.children).toEqual([
      { fieldId: "3", requiredOn: ["pending", "on_hold"] },
      { fieldId: "4", requiredOn: ["new", "open", "pending", "on_hold", "solved"] },
      { fieldId: "5", requiredOn: ["solved"] },
      { fieldId: "6", requiredOn: [] },
    ]);
    expect(everyone).toMatchObject({ brandIds: null, isDefault: true, conditions: [] });
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
    const { zendesk, calls } = provider({ "PUT /api/v2/tickets/1001.json": () => json({ ticket, users: [customer] }) });

    await zendesk.addComment("1001", { body: "Called the customer", public: false }, { email: "sam@oneix.local", externalUserId: "20" });

    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      ticket: { comment: { body: "Called the customer", public: false, author_id: 20 } },
    });
  });

  it("sends a public reply and changes the status in one update", async () => {
    const { zendesk, calls } = provider({
      "PUT /api/v2/tickets/1001.json": () => json({ ticket: { ...ticket, status: "pending" } }),
      "GET /api/v2/users/show_many.json": () => json({ users: [customer] }),
    });

    const result = await zendesk.addComment(
      "1001",
      { body: "We've fixed your invoice.", public: true, status: "pending" },
      { email: "sam@oneix.local", externalUserId: "20" },
    );

    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({
      ticket: { comment: { body: "We've fixed your invoice.", public: true, author_id: 20 }, status: "pending" },
    });
    expect(result.status).toBe("pending");
  });

  it("acts on behalf of the agent when impersonation is enabled", async () => {
    const { zendesk, calls } = provider({ "PUT /api/v2/tickets/1001.json": () => json({ ticket }) }, true);

    await zendesk.addComment("1001", { body: "Note", public: false }, { email: "sam@oneix.local", externalUserId: "20" });

    expect(calls[0]?.body).toMatchObject({ scope: "read write impersonate" });
    expect(putOf(calls)?.headers["X-On-Behalf-Of"]).toBe("sam@oneix.local");
    expect(putOf(calls)?.body).toEqual({ ticket: { comment: { body: "Note", public: false } } });
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

  it("authenticates with an API token and never impersonates", async () => {
    const fake = fakeFetch({ ...usersRoute, "PUT /api/v2/tickets/1001.json": () => json({ ticket }) });
    const zendesk = new ZendeskProvider({
      subdomain: "acme",
      apiToken: { email: "admin@acme.com", token: "abc" },
      impersonate: true,
      fetch: fake.fetch,
    });

    await zendesk.addComment("1001", { body: "Note", public: false }, { email: "sam@oneix.local", externalUserId: "20" });

    expect(fake.calls.every((c) => c.headers.Authorization === `Basic ${Buffer.from("admin@acme.com/token:abc").toString("base64")}`)).toBe(true);
    expect(putOf(fake.calls)?.headers["X-On-Behalf-Of"]).toBeUndefined();
    expect(putOf(fake.calls)?.body).toEqual({ ticket: { comment: { body: "Note", public: false, author_id: 20 } } });
  });

  it("lists every agent and admin across pages, marking suspended ones inactive", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/custom_roles.json": () => json({ custom_roles: [] }),
      "GET /api/v2/users.json": (call) =>
        call.url.searchParams.get("page[after]") === "p2"
          ? json({ users: [{ ...agent, id: 21, name: "Gone", suspended: true }], meta: { has_more: false, after_cursor: null } })
          : json({ users: [agent, { ...agent, id: 22, role: "admin", name: "Boss" }], meta: { has_more: true, after_cursor: "p2" } }),
    });

    const agents = await zendesk.listAgents();

    expect(calls.find((c) => c.url.pathname === "/api/v2/users.json")?.url.searchParams.getAll("role[]")).toEqual(["agent", "admin"]);
    expect(agents.map((a) => [a.externalId, a.role, a.active])).toEqual([
      ["20", "agent", true],
      ["22", "admin", true],
      ["21", "agent", false],
    ]);
  });

  it("reads each agent's reply permission and ticket access from roles", async () => {
    const { zendesk } = provider({
      "GET /api/v2/custom_roles.json": () =>
        json({
          custom_roles: [
            { id: 900, name: "Staff", configuration: { ticket_comment_access: "public" } },
            { id: 901, name: "Light agent", configuration: { ticket_comment_access: "none" } },
          ],
        }),
      "GET /api/v2/users.json": () =>
        json({
          users: [
            { ...agent, id: 30, name: "Staff", role_type: 0, custom_role_id: 900 },
            { ...agent, id: 31, name: "Light", role_type: 1, custom_role_id: 901, ticket_restriction: "groups", moderator: true },
            { ...agent, id: 32, name: "Admin", role: "admin", role_type: 4, ticket_restriction: null },
          ],
          meta: { has_more: false, after_cursor: null },
        }),
    });

    const agents = await zendesk.listAgents();

    expect(agents.map((a) => [a.name, a.roleNames, a.permissions])).toEqual([
      ["Staff", ["Staff"], { publicReplies: true, ticketAccess: "all" }],
      ["Light", ["Light agent", "Moderator"], { publicReplies: false, ticketAccess: "groups" }],
      ["Admin", ["Admin"], { publicReplies: true, ticketAccess: "all" }],
    ]);
  });

  it("falls back to the role type when custom roles are unavailable", async () => {
    const { zendesk } = provider({
      "GET /api/v2/custom_roles.json": () => json({ error: "Forbidden" }, 403),
      "GET /api/v2/users.json": () =>
        json({ users: [{ ...agent, id: 31, role_type: 1 }, { ...agent, id: 33, role_type: null }], meta: { has_more: false } }),
    });

    const agents = await zendesk.listAgents();

    expect(agents.map((a) => a.permissions.publicReplies)).toEqual([false, true]);
    expect(agents.map((a) => a.roleNames)).toEqual([["Light agent"], ["Agent"]]);
  });

  it("reads ticket groups and each agent's group and organization memberships", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/tickets/1001.json": () => json({ ticket: { ...ticket, group_id: 500, organization_id: 600 }, users: [] }),
      "GET /api/v2/custom_roles.json": () => json({ custom_roles: [] }),
      "GET /api/v2/group_memberships.json": () =>
        json({
          group_memberships: [
            { user_id: 31, group_id: 500 },
            { user_id: 31, group_id: 501 },
            { user_id: 32, group_id: 502 },
          ],
          meta: { has_more: false },
        }),
      "GET /api/v2/users/33/organization_memberships.json": () =>
        json({ organization_memberships: [{ user_id: 33, organization_id: 600 }, { user_id: 33, organization_id: 601 }] }),
      "GET /api/v2/users.json": () =>
        json({
          users: [
            { ...agent, id: 31, ticket_restriction: "groups", organization_id: 600 },
            { ...agent, id: 32, ticket_restriction: null },
            { ...agent, id: 33, ticket_restriction: "organization", organization_id: 600 },
          ],
          meta: { has_more: false },
        }),
    });

    const fetched = await zendesk.getTicket("1001");
    const agents = await zendesk.listAgents();

    expect([fetched?.groupExternalId, fetched?.organizationExternalId]).toEqual(["500", "600"]);
    expect(agents.map((a) => [a.externalId, a.groupExternalIds, a.organizationExternalIds])).toEqual([
      ["31", ["500", "501"], ["600"]],
      ["32", ["502"], []],
      ["33", [], ["600", "601"]],
    ]);
    // Only the organization-restricted agent needs its memberships looked up.
    expect(calls.filter((c) => c.url.pathname.includes("organization_memberships"))).toHaveLength(1);
  });

  it("creates a verified agent with a custom role and groups", async () => {
    const { zendesk, calls } = provider({
      "POST /api/v2/users.json": () =>
        json({ user: { id: 77, name: "New Agent", email: "new@acme.com", phone: null, role: "agent", role_type: 1, custom_role_id: 901 } }),
      "POST /api/v2/group_memberships.json": (call) =>
        json({ group_membership: { id: 1, user_id: 77, group_id: (call.body as { group_membership: { group_id: number } }).group_membership.group_id } }),
      "GET /api/v2/custom_roles.json": () =>
        json({ custom_roles: [{ id: 901, name: "Light agent", configuration: { ticket_comment_access: "none" } }] }),
    });

    const agent = await zendesk.createAgent({
      name: "New Agent",
      email: "new@acme.com",
      roleKey: "custom:901",
      groupExternalIds: ["500", "501"],
    });

    expect(calls.find((c) => c.method === "POST" && c.url.pathname === "/api/v2/users.json")?.body).toEqual({
      user: { name: "New Agent", email: "new@acme.com", role: "agent", custom_role_id: 901, verified: true },
    });
    expect(calls.filter((c) => c.url.pathname === "/api/v2/group_memberships.json").map((c) => c.body)).toEqual([
      { group_membership: { user_id: 77, group_id: 500 } },
      { group_membership: { user_id: 77, group_id: 501 } },
    ]);
    expect(agent).toMatchObject({
      externalId: "77",
      roleNames: ["Light agent"],
      groupExternalIds: ["500", "501"],
      permissions: { publicReplies: false },
    });
  });

  it("explains why Zendesk rejected a new agent", async () => {
    const { zendesk } = provider({
      "POST /api/v2/users.json": () =>
        json(
          {
            error: "RecordInvalid",
            description: "Record validation errors",
            details: { email: [{ description: "Email: new@acme.com is already being used by another user" }] },
          },
          422,
        ),
    });

    const error = await zendesk
      .createAgent({ name: "New", email: "new@acme.com", roleKey: "agent", groupExternalIds: [] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TicketingError);
    expect(error).toMatchObject({ status: 422, reasons: ["Email: new@acme.com is already being used by another user"] });
  });

  it("offers Admin and the custom roles as agent roles", async () => {
    const { zendesk } = provider({
      "GET /api/v2/custom_roles.json": () =>
        json({
          custom_roles: [
            { id: 900, name: "Staff", configuration: { ticket_comment_access: "public" } },
            { id: 901, name: "Light agent", configuration: { ticket_comment_access: "none" } },
          ],
        }),
    });

    expect(await zendesk.listAgentRoles()).toEqual([
      { key: "admin", name: "Admin", publicReplies: true },
      { key: "custom:900", name: "Staff", publicReplies: true },
      { key: "custom:901", name: "Light agent", publicReplies: false },
    ]);
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

describe("ZendeskProvider customers", () => {
  it("reuses an existing customer by email without changing their name", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/users/search.json": () => json({ users: [{ ...customer, email: "Casey@Example.com" }] }),
    });

    const found = await zendesk.findOrCreateCustomer({ name: "Someone Else", email: "casey@example.com" });

    expect(found.name).toBe("Casey Customer");
    expect(calls.find((c) => c.url.pathname.endsWith("search.json"))?.url.searchParams.get("query")).toBe(
      "email:casey@example.com",
    );
    expect(calls.some((c) => c.method === "POST" && c.url.pathname.startsWith("/api/"))).toBe(false);
  });

  it("creates the customer when nobody has the email", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/users/search.json": () => json({ users: [] }),
      "POST /api/v2/users/create_or_update.json": () => json({ user: { ...customer, id: 11, name: "New Person" } }),
    });

    const created = await zendesk.findOrCreateCustomer({ name: "New Person", email: "new@example.com" });

    expect(created).toMatchObject({ externalId: "11", name: "New Person" });
    expect(calls.find((c) => c.url.pathname === "/api/v2/users/create_or_update.json")?.body).toMatchObject({
      user: { name: "New Person", email: "new@example.com", role: "end-user" },
    });
  });
});

describe("ZendeskProvider tickets", () => {
  it("credits a system-created ticket's first note to the API's own user, with tags", async () => {
    const { zendesk, calls } = provider({
      "GET /api/v2/users/me.json": () => json({ user: { ...agent, id: 77 } }),
      "POST /api/v2/tickets.json": () => json({ ticket: { ...ticket, id: 1002 } }),
    });

    await zendesk.createTicket({ requesterExternalId: "10", subject: "Call", description: "Started", tags: ["web_call"] });
    await zendesk.createTicket({ requesterExternalId: "10", subject: "Call", description: "Started" });

    const posts = calls.filter((c) => c.url.pathname === "/api/v2/tickets.json");
    expect(posts[0]?.body).toEqual({
      ticket: {
        subject: "Call",
        requester_id: 10,
        comment: { body: "Started", public: false, author_id: 77 },
        tags: ["web_call"],
      },
    });
    // The API user is looked up once.
    expect(calls.filter((c) => c.url.pathname === "/api/v2/users/me.json")).toHaveLength(1);
  });
});
