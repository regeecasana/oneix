import { describe, expect, it } from "vitest";
import { scopeArgs, TenantScopeError } from "./tenant-scope.js";

describe("scopeArgs", () => {
  it("adds the tenant to reads", () => {
    expect(scopeArgs("Ticket", "findMany", { where: { status: "open" } }, "t1")).toEqual({
      where: { status: "open", tenantId: "t1" },
    });
    expect(scopeArgs("Ticket", "count", {}, "t1")).toEqual({ where: { tenantId: "t1" } });
  });

  it("adds the tenant to unique lookups, so another tenant's ID finds nothing", () => {
    expect(scopeArgs("Ticket", "findUnique", { where: { id: "x" } }, "t1")).toEqual({
      where: { id: "x", tenantId: "t1" },
    });
  });

  it("adds the tenant to updates and deletes", () => {
    expect(scopeArgs("Ticket", "update", { where: { id: "x" }, data: { subject: "s" } }, "t1")).toEqual({
      where: { id: "x", tenantId: "t1" },
      data: { subject: "s" },
    });
    expect(scopeArgs("Ticket", "deleteMany", { where: { externalId: "1" } }, "t1")).toEqual({
      where: { externalId: "1", tenantId: "t1" },
    });
  });

  it("stamps new rows with the tenant", () => {
    expect(scopeArgs("AuditLog", "create", { data: { action: "a" } }, "t1")).toEqual({
      data: { action: "a", tenantId: "t1" },
    });
    expect(scopeArgs("Customer", "createMany", { data: [{ name: "a" }, { name: "b" }] }, "t1")).toEqual({
      data: [
        { name: "a", tenantId: "t1" },
        { name: "b", tenantId: "t1" },
      ],
    });
    expect(
      scopeArgs("Customer", "upsert", { where: { id: "c" }, create: { name: "a" }, update: { name: "b" } }, "t1"),
    ).toEqual({ where: { id: "c", tenantId: "t1" }, create: { name: "a", tenantId: "t1" }, update: { name: "b" } });
  });

  it("refuses to touch another tenant", () => {
    expect(() => scopeArgs("Ticket", "findMany", { where: { tenantId: "t2" } }, "t1")).toThrow(TenantScopeError);
    expect(() => scopeArgs("Ticket", "create", { data: { tenantId: "t2" } }, "t1")).toThrow(TenantScopeError);
  });

  it("leaves tenant-independent models alone", () => {
    const args = { where: { email: "a@b.c" } };
    expect(scopeArgs("User", "findUnique", args, "t1")).toBe(args);
    expect(scopeArgs("Tenant", "findMany", {}, "t1")).toEqual({});
  });
});
