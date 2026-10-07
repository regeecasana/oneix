/** The subset of Zendesk API shapes oneix reads. */

export type ZendeskStatus = "new" | "open" | "pending" | "hold" | "solved" | "closed" | "deleted";
export type ZendeskPriority = "low" | "normal" | "high" | "urgent";

export interface ZendeskTicket {
  id: number;
  subject: string | null;
  status: ZendeskStatus;
  priority: ZendeskPriority | null;
  requester_id: number | null;
  assignee_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ZendeskUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: "end-user" | "agent" | "admin";
}

export interface ZendeskComment {
  id: number;
  body: string;
  plain_body?: string;
  public: boolean;
  author_id: number;
  created_at: string;
}

export interface TicketResponse {
  ticket: ZendeskTicket;
  users?: ZendeskUser[];
}

export interface UsersResponse {
  users: ZendeskUser[];
}

export interface UserResponse {
  user: ZendeskUser;
}

export interface CommentsResponse {
  comments: ZendeskComment[];
  users?: ZendeskUser[];
  meta?: { has_more: boolean; after_cursor: string | null };
}

export interface IncrementalTicketsResponse {
  tickets: ZendeskTicket[];
  users?: ZendeskUser[];
  end_time: number | null;
  end_of_stream: boolean;
}
