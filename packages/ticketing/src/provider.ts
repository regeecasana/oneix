import type { TicketPriority, TicketStatus } from "@oneix/contracts";

/**
 * The only way oneix talks to a ticketing backend.
 * Everything here is vendor-neutral: IDs are the backend's IDs as strings, called `externalId`.
 */
export interface TicketingProvider {
  findOrCreateCustomer(identity: CustomerIdentity): Promise<ExternalCustomer>;
  createTicket(input: CreateTicketInput, actor?: Actor): Promise<ExternalTicket>;
  /** Returns null when the ticket does not exist. */
  getTicket(externalId: string): Promise<ExternalTicket | null>;
  /** Comments on the ticket, oldest first. */
  getThread(externalId: string): Promise<ExternalComment[]>;
  /** Tickets changed since a point in time, for cache backfill. */
  listTickets(filter: ListTicketsFilter): Promise<TicketPage>;
  updateTicket(externalId: string, changes: TicketChanges, actor?: Actor): Promise<ExternalTicket>;
  addNote(externalId: string, note: { body: string }, actor?: Actor): Promise<void>;
  addConversationRecord(externalId: string, record: ConversationRecord): Promise<void>;
}

/** The agent an action is performed as, so ticket history shows the right person. */
export interface Actor {
  email: string;
  externalUserId: string | null;
}

export interface CustomerIdentity {
  name?: string;
  email?: string;
  /** E.164 */
  phone?: string;
}

export interface ExternalCustomer {
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ExternalTicket {
  externalId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  requester: ExternalCustomer | null;
  assigneeExternalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
}

export interface ExternalComment {
  externalId: string;
  body: string;
  public: boolean;
  author: {
    externalId: string | null;
    name: string;
    type: "customer" | "agent" | "system";
  };
  createdAt: Date;
}

export interface CreateTicketInput {
  requesterExternalId: string;
  subject: string;
  /** First internal comment on the ticket. */
  description: string;
}

export interface TicketChanges {
  status?: TicketStatus;
  priority?: TicketPriority | null;
  assigneeExternalId?: string | null;
}

export interface ListTicketsFilter {
  /** Start of the window. Ignored when `cursor` is given. */
  updatedSince?: Date;
  /** `nextCursor` from the previous page. */
  cursor?: string;
}

export interface TicketPage {
  tickets: ExternalTicket[];
  nextCursor: string | null;
  endOfStream: boolean;
}

export interface ConversationRecord {
  transcript: string;
  summary: string;
}
