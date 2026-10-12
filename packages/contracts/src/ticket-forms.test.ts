import { describe, expect, it } from "vitest";
import {
  type CustomFieldDefinition,
  formsForBrand,
  invalidFieldValue,
  shownFields,
  statusBlockers,
  type TicketFormDefinition,
} from "./ticket-forms.js";

function field(id: string, overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return { id, type: "text", title: id, description: null, requiredOn: [], editable: true, options: [], pattern: null, ...overrides };
}

const category = field("category", {
  type: "dropdown",
  options: [
    { name: "Incident", value: "incident", allowSolving: true },
    { name: "Refund::Pending", value: "refund_pending", allowSolving: false },
  ],
});
const affected = field("affected");
const impact = field("impact", { type: "checkbox" });
const details = field("details");
const reference = field("reference", { requiredOn: ["solved"] });
const fields = new Map([category, affected, impact, details, reference].map((f) => [f.id, f]));

const form: TicketFormDefinition = {
  id: "form",
  name: "Support",
  isDefault: true,
  active: true,
  brandIds: null,
  fieldIds: ["category", "affected", "impact", "details", "reference"],
  conditions: [
    // Incident shows "affected" (required always) and "impact".
    {
      parentFieldId: "category",
      value: "incident",
      children: [
        { fieldId: "affected", requiredOn: ["new", "open", "pending", "on_hold", "solved"] },
        { fieldId: "impact", requiredOn: [] },
      ],
    },
    // Ticking "impact" shows "details", required to solve.
    { parentFieldId: "impact", value: true, children: [{ fieldId: "details", requiredOn: ["solved"] }] },
  ],
};

const ids = (shown: { field: { id: string } }[]) => shown.map((s) => s.field.id);

describe("shownFields", () => {
  it("hides fields whose conditions don't match", () => {
    expect(ids(shownFields(form, fields, {}, "open"))).toEqual(["category", "reference"]);
  });

  it("shows children of a matching condition, and their children in turn", () => {
    expect(ids(shownFields(form, fields, { category: "incident" }, "open"))).toEqual([
      "category",
      "affected",
      "impact",
      "reference",
    ]);
    expect(ids(shownFields(form, fields, { category: "incident", impact: true }, "open"))).toContain("details");
  });

  it("hides a grandchild when its parent is hidden, even if the parent still has a value", () => {
    expect(ids(shownFields(form, fields, { category: "refund_pending", impact: true }, "open"))).not.toContain("details");
  });

  it("marks fields required at the status, from the field and from conditions", () => {
    const shown = shownFields(form, fields, { category: "incident", impact: true }, "open");
    const required = (id: string) => shown.find((s) => s.field.id === id)!;
    expect(required("affected").required).toBe(true);
    expect(required("details").required).toBe(false);
    expect(required("details").requiredToSolve).toBe(true);
    expect(required("reference").requiredToSolve).toBe(true);
  });
});

const messages = (...args: Parameters<typeof statusBlockers>) => statusBlockers(...args).map((b) => b.message);

describe("statusBlockers", () => {
  it("lists empty required fields for the status", () => {
    expect(messages(form, fields, { category: "incident" }, "open")).toEqual(["affected is required"]);
    expect(messages(form, fields, { category: "incident", affected: "Login" }, "solved")).toEqual([
      "reference is required",
    ]);
  });

  it("ignores required fields that are hidden", () => {
    expect(messages(form, fields, { reference: "R-1" }, "solved")).toEqual([]);
  });

  it("blocks solving with an option that doesn't allow it", () => {
    expect(messages(form, fields, { category: "refund_pending", reference: "R-1" }, "solved")).toEqual([
      'category: "Refund › Pending" doesn\'t allow solving',
    ]);
    expect(messages(form, fields, { category: "refund_pending" }, "pending")).toEqual([]);
  });
});

describe("invalidFieldValue", () => {
  it("checks values against the field type", () => {
    expect(invalidFieldValue(category, "incident")).toBeNull();
    expect(invalidFieldValue(category, "unknown")).toBe("isn't one of the options");
    expect(invalidFieldValue(field("n", { type: "integer" }), "12")).toBeNull();
    expect(invalidFieldValue(field("n", { type: "integer" }), "1.5")).toBe("must be a whole number");
    expect(invalidFieldValue(field("d", { type: "date" }), "2026-10-12")).toBeNull();
    expect(invalidFieldValue(field("r", { type: "regexp", pattern: "^\\d{3}$" }), "12a")).toBe(
      "doesn't match the required format",
    );
    expect(invalidFieldValue(field("l", { type: "lookup" }), "1")).toBe("can't be changed in oneix");
    expect(invalidFieldValue(category, null)).toBeNull();
  });
});

describe("formsForBrand", () => {
  it("offers active forms for the brand, plus the current form", () => {
    const forms: TicketFormDefinition[] = [
      { ...form, id: "all" },
      { ...form, id: "a", brandIds: ["brand-a"] },
      { ...form, id: "b", brandIds: ["brand-b"] },
      { ...form, id: "old", active: false },
    ];
    expect(formsForBrand(forms, "brand-a").map((f) => f.id)).toEqual(["all", "a"]);
    expect(formsForBrand(forms, "brand-a", "old").map((f) => f.id)).toEqual(["all", "a", "old"]);
  });
});
