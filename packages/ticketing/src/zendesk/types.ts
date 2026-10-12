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
  group_id?: number | null;
  organization_id?: number | null;
  /** How the ticket was created, for example "email", "web", "native_messaging". */
  via?: { channel?: string | null } | null;
  brand_id?: number | null;
  ticket_form_id?: number | null;
  custom_fields?: { id: number; value: ZendeskFieldValue }[];
  created_at: string;
  updated_at: string;
}

export type ZendeskFieldValue = string | number | boolean | string[] | null;

/** Required-at-status setting of a conditional child field. */
export interface ZendeskRequiredOnStatuses {
  type: "ALL_STATUSES" | "SOME_STATUSES" | "NO_STATUSES";
  statuses?: string[];
}

export interface ZendeskTicketField {
  id: number;
  type: string;
  title: string;
  description?: string | null;
  agent_description?: string | null;
  position: number;
  active: boolean;
  /** Required to solve, for agents. */
  required: boolean;
  /** False when agents may only view the field. */
  agent_can_edit?: boolean;
  /** False for built-in fields such as subject and status. */
  removable: boolean;
  regexp_for_validation?: string | null;
  custom_field_options?: { name: string; value: string; allow_solving?: boolean }[];
}

export interface TicketFieldsResponse {
  ticket_fields: ZendeskTicketField[];
  meta?: { has_more: boolean; after_cursor: string | null };
}

export interface ZendeskTicketForm {
  id: number;
  name: string;
  position: number;
  active: boolean;
  default: boolean;
  in_all_brands: boolean;
  restricted_brand_ids?: number[];
  ticket_field_ids: number[];
  agent_conditions?: {
    parent_field_id: number;
    value: string | boolean;
    child_fields: { id: number; is_required?: boolean; required_on_statuses?: ZendeskRequiredOnStatuses }[];
  }[];
}

export interface TicketFormsResponse {
  ticket_forms: ZendeskTicketForm[];
}

export interface ZendeskUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: "end-user" | "agent" | "admin";
  active?: boolean;
  suspended?: boolean;
  /** 0 custom, 1 light agent, 2 chat-only, 3 contributor, 4 admin, 5 billing admin. */
  role_type?: number | null;
  custom_role_id?: number | null;
  /** Can moderate help center community content. */
  moderator?: boolean;
  organization_id?: number | null;
  ticket_restriction?: "organization" | "groups" | "assigned" | "requested" | null;
}

export interface GroupMembershipsResponse {
  group_memberships: { user_id: number; group_id: number }[];
  meta?: { has_more: boolean; after_cursor: string | null };
}

export interface OrganizationMembershipsResponse {
  organization_memberships: { user_id: number; organization_id: number }[];
  meta?: { has_more: boolean; after_cursor: string | null };
}

export interface GroupsResponse {
  groups: { id: number; name: string; deleted?: boolean }[];
  meta?: { has_more: boolean; after_cursor: string | null };
}

export interface GroupMembershipResponse {
  group_membership: { id: number; user_id: number; group_id: number };
}

export interface CustomRolesResponse {
  custom_roles: { id: number; name: string; configuration?: { ticket_comment_access?: "public" | "none" | string } }[];
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

export interface UsersPageResponse {
  users: ZendeskUser[];
  meta?: { has_more: boolean; after_cursor: string | null };
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
