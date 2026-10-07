import type {
  Actor,
  ConversationRecord,
  CreateTicketInput,
  CustomerIdentity,
  ExternalComment,
  ExternalCustomer,
  ExternalTicket,
  ListTicketsFilter,
  TicketChanges,
  TicketingProvider,
  TicketPage,
} from "../provider.js";
import { TicketingError } from "../errors.js";
import { ZendeskClient, type ZendeskClientConfig } from "./client.js";
import { indexUsers, toComment, toCustomer, toTicket, toZendeskStatus } from "./mapping.js";
import type {
  CommentsResponse,
  IncrementalTicketsResponse,
  TicketResponse,
  UserResponse,
  UsersResponse,
  ZendeskComment,
  ZendeskTicket,
  ZendeskUser,
} from "./types.js";

export type ZendeskConfig = ZendeskClientConfig;

const SHOW_MANY_LIMIT = 100;

export class ZendeskProvider implements TicketingProvider {
  private readonly client: ZendeskClient;

  constructor(config: ZendeskConfig) {
    this.client = new ZendeskClient(config);
  }

  async findOrCreateCustomer(identity: CustomerIdentity): Promise<ExternalCustomer> {
    if (!identity.email && !identity.phone) {
      throw new Error("A customer needs an email or a phone number");
    }

    // create_or_update matches on email. Phone-only customers are searched first to avoid duplicates.
    if (!identity.email && identity.phone) {
      const found = await this.client.request<UsersResponse>("GET", "/api/v2/users/search.json", {
        query: { query: identity.phone },
      });
      const match = found.users.find((user) => user.role === "end-user" && user.phone === identity.phone);
      if (match) return toCustomer(match);
    }

    const { user } = await this.client.request<UserResponse>("POST", "/api/v2/users/create_or_update.json", {
      body: {
        user: {
          name: identity.name ?? identity.email ?? identity.phone,
          email: identity.email,
          phone: identity.phone,
          role: "end-user",
        },
      },
    });
    return toCustomer(user);
  }

  async createTicket(input: CreateTicketInput, actor?: Actor): Promise<ExternalTicket> {
    const { ticket } = await this.client.request<TicketResponse>("POST", "/api/v2/tickets.json", {
      onBehalfOf: actor?.email,
      body: {
        ticket: {
          subject: input.subject,
          requester_id: Number(input.requesterExternalId),
          comment: { body: input.description, public: false, ...this.authorFor(actor) },
        },
      },
    });
    return this.withUsers(ticket);
  }

  async getTicket(externalId: string): Promise<ExternalTicket | null> {
    try {
      const response = await this.client.request<TicketResponse>("GET", `/api/v2/tickets/${id(externalId)}.json`, {
        query: { include: "users" },
      });
      return toTicket(response.ticket, indexUsers(response.users));
    } catch (error) {
      if (error instanceof TicketingError && error.notFound) return null;
      throw error;
    }
  }

  async getThread(externalId: string): Promise<ExternalComment[]> {
    const comments: ZendeskComment[] = [];
    const users = new Map<number, ZendeskUser>();
    let after: string | undefined;

    do {
      const page = await this.client.request<CommentsResponse>(
        "GET",
        `/api/v2/tickets/${id(externalId)}/comments.json`,
        { query: { include: "users", "page[size]": 100, "page[after]": after } },
      );
      comments.push(...page.comments);
      for (const user of page.users ?? []) users.set(user.id, user);
      after = page.meta?.has_more ? (page.meta.after_cursor ?? undefined) : undefined;
    } while (after);

    return comments.map((comment) => toComment(comment, users));
  }

  async listTickets(filter: ListTicketsFilter): Promise<TicketPage> {
    const startTime = filter.cursor
      ? Number(filter.cursor)
      : Math.floor((filter.updatedSince?.getTime() ?? 0) / 1000);

    const page = await this.client.request<IncrementalTicketsResponse>(
      "GET",
      "/api/v2/incremental/tickets.json",
      { query: { start_time: startTime, include: "users" } },
    );

    const users = indexUsers(page.users);
    await this.loadMissingUsers(page.tickets, users);

    return {
      tickets: page.tickets.map((ticket) => toTicket(ticket, users)),
      nextCursor: page.end_time === null ? null : String(page.end_time),
      endOfStream: page.end_of_stream,
    };
  }

  async updateTicket(externalId: string, changes: TicketChanges, actor?: Actor): Promise<ExternalTicket> {
    const ticket: Record<string, unknown> = {};
    if (changes.status !== undefined) ticket.status = toZendeskStatus(changes.status);
    if (changes.priority !== undefined) ticket.priority = changes.priority;
    if (changes.assigneeExternalId !== undefined) {
      ticket.assignee_id = changes.assigneeExternalId === null ? null : Number(changes.assigneeExternalId);
    }

    const response = await this.client.request<TicketResponse>("PUT", `/api/v2/tickets/${id(externalId)}.json`, {
      onBehalfOf: actor?.email,
      body: { ticket },
    });
    return this.withUsers(response.ticket);
  }

  async addNote(externalId: string, note: { body: string }, actor?: Actor): Promise<void> {
    await this.client.request("PUT", `/api/v2/tickets/${id(externalId)}.json`, {
      onBehalfOf: actor?.email,
      body: { ticket: { comment: { body: note.body, public: false, ...this.authorFor(actor) } } },
    });
  }

  async addConversationRecord(externalId: string, record: ConversationRecord): Promise<void> {
    const body = `Summary\n${record.summary}\n\nTranscript\n${record.transcript}`;
    await this.client.request("PUT", `/api/v2/tickets/${id(externalId)}.json`, {
      body: { ticket: { comment: { body, public: false } } },
    });
  }

  /** Without impersonation, the comment author is set explicitly so history shows the agent. */
  private authorFor(actor: Actor | undefined): { author_id?: number } {
    if (!actor?.externalUserId || this.client.impersonationEnabled) return {};
    return { author_id: Number(actor.externalUserId) };
  }

  private async withUsers(ticket: ZendeskTicket): Promise<ExternalTicket> {
    const users = new Map<number, ZendeskUser>();
    await this.loadMissingUsers([ticket], users);
    return toTicket(ticket, users);
  }

  private async loadMissingUsers(tickets: ZendeskTicket[], users: Map<number, ZendeskUser>): Promise<void> {
    const missing = [
      ...new Set(
        tickets.map((t) => t.requester_id).filter((rid): rid is number => rid !== null && !users.has(rid)),
      ),
    ];
    for (let i = 0; i < missing.length; i += SHOW_MANY_LIMIT) {
      const ids = missing.slice(i, i + SHOW_MANY_LIMIT).join(",");
      const response = await this.client.request<UsersResponse>("GET", "/api/v2/users/show_many.json", {
        query: { ids },
      });
      for (const user of response.users) users.set(user.id, user);
    }
  }
}

/** Guards path segments: backend ticket IDs are numeric. */
function id(externalId: string): string {
  if (!/^\d+$/.test(externalId)) throw new Error(`Invalid ticket ID: ${externalId}`);
  return externalId;
}
