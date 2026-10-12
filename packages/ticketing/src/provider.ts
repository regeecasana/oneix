import type {
  CustomFieldDefinition,
  CustomFieldValues,
  TicketChannel,
  TicketFormDefinition,
  TicketPriority,
  TicketStatus,
} from "@oneix/contracts";

/**
 * The only way oneix talks to a ticketing backend.
 * Everything here is vendor-neutral: IDs are the backend's IDs as strings, called `externalId`.
 */
export interface TicketingProvider {
  /** The backend user the credentials belong to. Used to verify a connection. */
  getCurrentUser(): Promise<ExternalAgent>;
  /** Every agent and admin in the backend, including suspended ones. */
  listAgents(): Promise<ExternalAgent[]>;
  /** The roles a new agent can be given, for example Admin, Agent, or a custom role such as Light agent. */
  listAgentRoles(): Promise<ExternalAgentRole[]>;
  /** The groups agents can belong to. */
  listGroups(): Promise<ExternalGroup[]>;
  /**
   * Creates an agent in the backend, already verified so the backend sends them nothing: they work
   * through oneix. Fails if the email belongs to an existing user or the plan has no free seat.
   */
  createAgent(input: NewAgent): Promise<ExternalAgent>;
  /** Every ticket form, including inactive ones. */
  listTicketForms(): Promise<ExternalTicketForm[]>;
  /** Every custom ticket field oneix can show. Built-in fields such as status are left out. */
  listTicketFields(): Promise<ExternalTicketField[]>;
  findOrCreateCustomer(identity: CustomerIdentity): Promise<ExternalCustomer>;
  createTicket(input: CreateTicketInput, actor?: Actor): Promise<ExternalTicket>;
  /** Returns null when the ticket does not exist. */
  getTicket(externalId: string): Promise<ExternalTicket | null>;
  /** Comments on the ticket, oldest first. */
  getThread(externalId: string): Promise<ExternalComment[]>;
  /** Tickets changed since a point in time, for cache backfill. */
  listTickets(filter: ListTicketsFilter): Promise<TicketPage>;
  updateTicket(externalId: string, changes: TicketChanges, actor?: Actor): Promise<ExternalTicket>;
  /**
   * Adds a comment, optionally changing the status in the same update.
   * A public comment is sent to the requester by the backend (for example by email).
   */
  addComment(externalId: string, comment: NewComment, actor?: Actor): Promise<ExternalTicket>;
  addConversationRecord(externalId: string, record: ConversationRecord): Promise<void>;
}

/** The agent an action is performed as, so ticket history shows the right person. */
export interface Actor {
  email: string;
  externalUserId: string | null;
}

export interface ExternalAgent {
  externalId: string;
  name: string;
  email: string | null;
  role: "agent" | "admin" | "end_user";
  /** False when the agent is suspended or deleted in the backend. */
  active: boolean;
  /** Every role the agent holds in the backend, as the backend names them: "Light agent", "Moderator". */
  roleNames: string[];
  /** Groups the agent belongs to. */
  groupExternalIds: string[];
  /** Organizations the agent belongs to, for organization-restricted agents. */
  organizationExternalIds: string[];
  permissions: AgentPermissions;
}

/** What the backend lets an agent do. oneix enforces these so the backend never silently overrides an action. */
export interface AgentPermissions {
  /** False for agents limited to internal notes, such as Zendesk light agents. */
  publicReplies: boolean;
  /** Which tickets the agent may see in the backend. */
  ticketAccess: "all" | "groups" | "organization" | "assigned" | "requested";
}

export interface ExternalAgentRole {
  /** Stable key: "admin", "agent", or "custom:<backend role ID>". */
  key: string;
  name: string;
  /** Whether agents with this role may reply publicly. */
  publicReplies: boolean;
}

export interface ExternalGroup {
  externalId: string;
  name: string;
}

export interface NewAgent {
  name: string;
  email: string;
  /** An `ExternalAgentRole.key`. */
  roleKey: string;
  groupExternalIds: string[];
}

/** A ticket form; IDs are backend IDs. `fieldIds` lists every field on the form, built-in ones too. */
export interface ExternalTicketForm extends TicketFormDefinition {
  position: number;
}

/** A custom ticket field; IDs are backend IDs. */
export interface ExternalTicketField extends CustomFieldDefinition {
  position: number;
  active: boolean;
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
  /** The number agents and customers know the ticket by; in Zendesk, the ticket ID. */
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  requester: ExternalCustomer | null;
  assigneeExternalId: string | null;
  /** The group the ticket is assigned to, which decides who may see it under group restrictions. */
  groupExternalId: string | null;
  organizationExternalId: string | null;
  /** How the ticket reached support, grouped. */
  channel: TicketChannel;
  /** The specific source within the channel, readable, for example "WhatsApp". */
  channelDetail: string | null;
  /** The ticket form; null when the ticket uses the default. */
  formExternalId: string | null;
  brandExternalId: string | null;
  /** Custom field values by field ID, empty ones left out. */
  customFields: CustomFieldValues;
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

export interface NewComment {
  body: string;
  /** True: a reply the requester sees. False: an internal note for agents only. */
  public: boolean;
  status?: TicketStatus;
}

export interface TicketChanges {
  status?: TicketStatus;
  priority?: TicketPriority | null;
  assigneeExternalId?: string | null;
  formExternalId?: string;
  /** Values to change by field ID; null clears a field. */
  customFields?: CustomFieldValues;
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
