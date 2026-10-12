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

/** How a ticket reached support, grouped for the inbox tabs. */
export const TICKET_CHANNELS = [
  "email",
  "chat",
  "messaging",
  "sunshine_conversations",
  "social",
  "phone",
  "web_form",
  "api",
  "other",
] as const;
export const TicketChannel = z.enum(TICKET_CHANNELS);
export type TicketChannel = z.infer<typeof TicketChannel>;

export const TicketSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  subject: z.string(),
  status: TicketStatus,
  priority: TicketPriority.nullable(),
  customer: CustomerSummary.nullable(),
  assignee: PersonRef.nullable(),
  channel: TicketChannel,
  /** The specific source within the channel, for example "WhatsApp" under social. */
  channelDetail: z.string().nullable(),
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

/** Filter value for tickets without a priority. */
export const NO_PRIORITY = "none" as const;
export const PriorityFilter = z.union([TicketPriority, z.literal(NO_PRIORITY)]);
export type PriorityFilter = z.infer<typeof PriorityFilter>;

/** Splits a comma-separated query parameter: `status=open,pending`. */
const splitList = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** One or more statuses as a query parameter. */
const StatusList = z.string().transform(splitList).pipe(z.array(TicketStatus).min(1));
/** One or more priorities as a query parameter, `none` for tickets without one. */
const PriorityList = z.string().transform(splitList).pipe(z.array(PriorityFilter).min(1));

/** Columns the inbox can be sorted by. */
export const TICKET_SORT_FIELDS = [
  "number",
  "subject",
  "channel",
  "customer",
  "status",
  "priority",
  "assignee",
  "updatedAt",
] as const;
export const TicketSortField = z.enum(TICKET_SORT_FIELDS);
export type TicketSortField = z.infer<typeof TicketSortField>;

export const SortOrder = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof SortOrder>;

/** Query filters shared by the ticket list and the channel counts; descriptions show in the API docs. */
const StatusQuery = StatusList.optional().meta({
  description: `One or more statuses, comma-separated: ${TICKET_STATUSES.join(", ")}.`,
  example: "open,pending",
});
const PriorityQuery = PriorityList.optional().meta({
  description: `One or more priorities, comma-separated: ${TICKET_PRIORITIES.join(", ")}, or ${NO_PRIORITY} for tickets without one.`,
  example: "urgent,high",
});
const AssigneeQuery = z
  .string()
  .min(1)
  .optional()
  .meta({ description: "`me`, `unassigned`, or an agent's user ID. Omit for everyone's tickets.", example: "me" });

export const ListTicketsQuery = z.object({
  status: StatusQuery,
  priority: PriorityQuery,
  assignee: AssigneeQuery,
  channel: TicketChannel.optional().meta({ description: "Only tickets from this channel." }),
  page: z.coerce.number().int().min(1).default(1).meta({ description: "Page number, from 1." }),
  pageSize: z.coerce.number().int().min(1).max(100).default(25).meta({ description: "Tickets per page, up to 100." }),
  sort: TicketSortField.default("updatedAt").meta({ description: "Column to sort by." }),
  order: SortOrder.default("desc").meta({ description: "Sort direction." }),
});
export type ListTicketsQuery = z.input<typeof ListTicketsQuery>;

export const ListTicketsResponse = paginated(TicketSummary);

/** Filters for the channel counts: the list's filters, without the channel itself. */
export const ChannelCountsQuery = z.object({
  status: StatusQuery,
  priority: PriorityQuery,
  assignee: AssigneeQuery,
});
export type ChannelCountsQuery = z.input<typeof ChannelCountsQuery>;

/** Tickets per channel for the inbox tabs. Channels with no tickets are left out. */
export const ChannelCountsResponse = z.object({
  total: z.number().int(),
  channels: z.array(z.object({ channel: TicketChannel, count: z.number().int() })),
});
export type ChannelCountsResponse = z.infer<typeof ChannelCountsResponse>;
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
