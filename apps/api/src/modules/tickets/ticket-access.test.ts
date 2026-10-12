import { describe, expect, it } from "vitest";
import type { SessionUser } from "../../common/auth.js";
import { ticketAccessWhere } from "./ticket-access.js";

const agent = (overrides: Partial<SessionUser>): SessionUser => ({
  id: "u1",
  email: "a@b.c",
  name: "Agent",
  sessionId: "s1",
  tenantId: "t1",
  role: "agent",
  zendeskUserId: "900",
  canReplyPublicly: true,
  ticketAccess: "all",
  groupExternalIds: [],
  organizationExternalIds: [],
  ...overrides,
});

describe("ticketAccessWhere", () => {
  it("does not restrict agents with full access", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "all" }))).toEqual({});
  });

  it("limits group-restricted agents to their groups and their own tickets", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "groups", groupExternalIds: ["10", "11"] }))).toEqual({
      OR: [{ groupExternalId: { in: ["10", "11"] } }, { assigneeId: "u1" }],
    });
  });

  it("shows a group-restricted agent without groups only their own tickets", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "groups" }))).toEqual({
      OR: [{ groupExternalId: { in: [] } }, { assigneeId: "u1" }],
    });
  });

  it("limits organization-restricted agents to their organizations", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "organization", organizationExternalIds: ["70"] }))).toEqual({
      OR: [{ organizationExternalId: { in: ["70"] } }, { assigneeId: "u1" }],
    });
  });

  it("limits assigned-only agents to tickets assigned to them", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "assigned" }))).toEqual({ assigneeId: "u1" });
  });

  it("limits requested-only agents to tickets they requested or are assigned", () => {
    expect(ticketAccessWhere(agent({ ticketAccess: "requested" }))).toEqual({
      OR: [{ customer: { externalId: "900" } }, { assigneeId: "u1" }],
    });
  });
});
