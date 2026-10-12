import { describe, expect, it } from "vitest";
import { searchWhere, ticketOrderBy } from "./tickets.service.js";

describe("ticketOrderBy", () => {
  it("defaults to the most recent update with the ID as tie-breaker", () => {
    expect(ticketOrderBy("updatedAt", "desc")).toEqual([{ externalUpdatedAt: "desc" }, { id: "desc" }]);
  });

  it("sorts by a column in either direction, then by recency", () => {
    expect(ticketOrderBy("subject", "asc")).toEqual([
      { subject: "asc" },
      { externalUpdatedAt: "desc" },
      { id: "desc" },
    ]);
    expect(ticketOrderBy("number", "desc")[0]).toEqual({ number: "desc" });
  });

  it("sorts by the related customer and assignee names", () => {
    expect(ticketOrderBy("customer", "asc")[0]).toEqual({ customer: { name: { sort: "asc", nulls: "last" } } });
    expect(ticketOrderBy("assignee", "desc")[0]).toEqual({ assignee: { name: "desc" } });
  });

  it("keeps tickets without a priority last in both directions", () => {
    expect(ticketOrderBy("priority", "asc")[0]).toEqual({ priority: { sort: "asc", nulls: "last" } });
    expect(ticketOrderBy("priority", "desc")[0]).toEqual({ priority: { sort: "desc", nulls: "last" } });
  });
});

describe("searchWhere", () => {
  it("matches the subject and customer, case-insensitively", () => {
    const where = searchWhere("refund");
    expect(where.OR).toEqual([
      { subject: { contains: "refund", mode: "insensitive" } },
      { customer: { name: { contains: "refund", mode: "insensitive" } } },
      { customer: { email: { contains: "refund", mode: "insensitive" } } },
    ]);
  });

  it("also matches the ticket number, with or without #", () => {
    expect(searchWhere("#8602").OR).toContainEqual({ number: 8602 });
    expect(searchWhere("8602").OR).toContainEqual({ number: 8602 });
  });
});
