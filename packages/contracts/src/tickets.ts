import { z } from "zod";
import { paginated } from "./common.js";

export const TICKET_STATUSES = ["new", "open", "pending", "on_hold", "solved", "closed"] as const;
export const TicketStatus = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatus>;

/** Statuses an agent can set. `new` and `closed` are set by the backend. */
export const SETTABLE_TICKET_STATUSES = ["open", "pending", "on_hold", "solved"] as const;
export const SettableTicketStatus = z.enum(SETTABLE_TICKET_STATUSES);
export type SettableTicketStatus = z.infer<typeof SettableTicketStatus>;

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TicketPriority = z.enum(TICKET_PRIORITIES);
export type TicketPriority = z.infer<typeof TicketPriority>;

export const PersonRef = z.object({
  id: z.string(),
  name: z.string(),
});
export type PersonRef = z.infer<typeof PersonRef>;

export const CustomerSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type CustomerSummary = z.infer<typeof CustomerSummary>;

export const TicketSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  subject: z.string(),
  status: TicketStatus,
  priority: TicketPriority.nullable(),
  customer: CustomerSummary.nullable(),
  assignee: PersonRef.nullable(),
  updatedAt: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof TicketSummary>;

export const ThreadEntry = z.object({
  id: z.string(),
  kind: z.enum(["message", "internal_note"]),
  body: z.string(),
  author: z.object({
    name: z.string(),
    type: z.enum(["customer", "agent", "system"]),
  }),
  createdAt: z.iso.datetime(),
});
export type ThreadEntry = z.infer<typeof ThreadEntry>;

export const TicketDetail = TicketSummary.extend({
  thread: z.array(ThreadEntry),
});
export type TicketDetail = z.infer<typeof TicketDetail>;

export const ListTicketsQuery = z.object({
  status: TicketStatus.optional(),
  /** `me`, `unassigned`, or a user ID. Omit for all tickets. */
  assignee: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.input<typeof ListTicketsQuery>;

export const ListTicketsResponse = paginated(TicketSummary);
export type ListTicketsResponse = z.infer<typeof ListTicketsResponse>;

export const UpdateTicketRequest = z
  .object({
    status: SettableTicketStatus.optional(),
    priority: TicketPriority.nullable().optional(),
    assigneeId: z.string().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes given" });
export type UpdateTicketRequest = z.infer<typeof UpdateTicketRequest>;

export const AddCommentRequest = z.object({
  body: z.string().trim().min(1).max(64_000),
  /** True: a reply the customer receives. False: an internal note for agents only. */
  public: z.boolean(),
  /** Changes the status in the same update, like "Submit as Pending". */
  status: SettableTicketStatus.optional(),
});
export type AddCommentRequest = z.infer<typeof AddCommentRequest>;
