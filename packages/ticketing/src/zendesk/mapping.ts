import {
  type CustomFieldType,
  type CustomFieldValues,
  isEmptyValue,
  TICKET_STATUSES,
  type TicketChannel,
  type TicketStatus,
} from "@oneix/contracts";
import type {
  ExternalAgent,
  ExternalComment,
  ExternalCustomer,
  ExternalTicket,
  ExternalTicketField,
  ExternalTicketForm,
} from "../provider.js";
import type {
  ZendeskComment,
  ZendeskRequiredOnStatuses,
  ZendeskStatus,
  ZendeskTicket,
  ZendeskTicketField,
  ZendeskTicketForm,
  ZendeskUser,
} from "./types.js";

export function fromZendeskStatus(status: ZendeskStatus): TicketStatus {
  switch (status) {
    case "hold":
      return "on_hold";
    case "deleted":
      return "closed";
    default:
      return status;
  }
}

export function toZendeskStatus(status: TicketStatus): Exclude<ZendeskStatus, "deleted"> {
  return status === "on_hold" ? "hold" : status;
}

export function toCustomer(user: ZendeskUser): ExternalCustomer {
  return {
    externalId: String(user.id),
    name: user.name || null,
    email: user.email || null,
    phone: user.phone || null,
  };
}

/** Zendesk role types limited to private comments: light agent, chat-only agent, contributor. */
const PRIVATE_COMMENT_ROLE_TYPES = new Set([1, 2, 3]);

/** Names for Zendesk's built-in role types, used when an agent has no custom role. */
const ROLE_TYPE_NAMES: Record<number, string> = {
  1: "Light agent",
  2: "Chat-only agent",
  3: "Contributor",
  4: "Admin",
  5: "Billing admin",
};

/** A Zendesk custom role, as far as oneix needs it. */
export interface CustomRole {
  name: string;
  publicComments: boolean;
}

/** Every role the user holds, primary role first: "Light agent", "Moderator". */
export function roleNamesOf(user: ZendeskUser, customRoles?: Map<number, CustomRole>): string[] {
  const customRole = user.custom_role_id != null ? customRoles?.get(user.custom_role_id) : undefined;
  const primary =
    user.role === "admin"
      ? "Admin"
      : (customRole?.name ?? ROLE_TYPE_NAMES[user.role_type ?? -1] ?? (user.role === "agent" ? "Agent" : "End user"));
  return user.moderator ? [primary, "Moderator"] : [primary];
}

/**
 * @param customRoles the account's custom roles by ID. When they could not be read, pass undefined
 *   and the role type decides.
 */
export interface AgentMemberships {
  groups?: string[];
  organizations?: string[];
}

export function toAgent(
  user: ZendeskUser,
  customRoles?: Map<number, CustomRole>,
  memberships: AgentMemberships = {},
): ExternalAgent {
  let publicReplies = user.role === "admin" || !PRIVATE_COMMENT_ROLE_TYPES.has(user.role_type ?? -1);
  const customRole = user.custom_role_id != null ? customRoles?.get(user.custom_role_id) : undefined;
  if (user.role !== "admin" && customRole) publicReplies = customRole.publicComments;
  return {
    externalId: String(user.id),
    name: user.name,
    email: user.email || null,
    role: user.role === "end-user" ? "end_user" : user.role,
    active: user.active !== false && user.suspended !== true,
    roleNames: roleNamesOf(user, customRoles),
    groupExternalIds: memberships.groups ?? [],
    organizationExternalIds:
      memberships.organizations ?? (user.organization_id == null ? [] : [String(user.organization_id)]),
    permissions: {
      publicReplies,
      ticketAccess: user.role === "admin" ? "all" : (user.ticket_restriction ?? "all"),
    },
  };
}

/** Zendesk channels that are social networks or chat apps. */
const SOCIAL_CHANNELS = new Set([
  "whatsapp",
  "facebook",
  "facebook_messenger",
  "instagram",
  "instagram_dm",
  "twitter",
  "twitter_dm",
  "x_corp_dm",
  "viber",
  "line",
  "wechat",
  "telegram",
  "kakaotalk",
  "apple_business_chat",
  "google_rcs",
]);

const CHANNEL_DETAIL_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  facebook_messenger: "Messenger",
  instagram: "Instagram",
  instagram_dm: "Instagram",
  twitter: "X",
  twitter_dm: "X",
  x_corp_dm: "X",
  viber: "Viber",
  line: "LINE",
  wechat: "WeChat",
  telegram: "Telegram",
  kakaotalk: "KakaoTalk",
  apple_business_chat: "Apple Messages",
  google_rcs: "RCS",
  native_messaging: "Messaging",
  mobile_sdk: "Mobile app",
  voice: "Voice",
  sms: "SMS",
  web: "Web form",
  help_center: "Help center",
  side_conversation: "Side conversation",
  api: "API",
};

/**
 * Groups Zendesk's `via.channel` into the channels oneix shows, and keeps the specific source.
 * Sunshine Conversations channels arrive as `sunshine_conversations_<source>`.
 */
export function toChannel(viaChannel: string | null | undefined): { channel: TicketChannel; detail: string | null } {
  const raw = viaChannel ?? "";
  const named = (key: string) => CHANNEL_DETAIL_NAMES[key] ?? humanize(key);

  if (raw.startsWith("sunshine_conversations")) {
    const source = raw.replace(/^sunshine_conversations_?/, "");
    return { channel: "sunshine_conversations", detail: source ? named(source) : null };
  }
  if (raw === "email") return { channel: "email", detail: null };
  if (raw === "chat" || raw === "chat_transcript") return { channel: "chat", detail: null };
  if (raw === "native_messaging" || raw === "mobile_sdk") return { channel: "messaging", detail: named(raw) };
  if (SOCIAL_CHANNELS.has(raw)) return { channel: "social", detail: named(raw) };
  if (raw === "voice" || raw === "sms") return { channel: "phone", detail: named(raw) };
  if (raw === "web" || raw === "help_center" || raw === "mobile") return { channel: "web_form", detail: named(raw) };
  if (raw === "api") return { channel: "api", detail: null };
  return { channel: "other", detail: raw ? named(raw) : null };
}

function humanize(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toTicket(ticket: ZendeskTicket, users: Map<number, ZendeskUser>): ExternalTicket {
  const requester = ticket.requester_id === null ? undefined : users.get(ticket.requester_id);
  const channel = toChannel(ticket.via?.channel);
  return {
    externalId: String(ticket.id),
    number: ticket.id,
    subject: ticket.subject || "(no subject)",
    status: fromZendeskStatus(ticket.status),
    priority: ticket.priority,
    requester: requester ? toCustomer(requester) : null,
    assigneeExternalId: ticket.assignee_id === null ? null : String(ticket.assignee_id),
    groupExternalId: ticket.group_id == null ? null : String(ticket.group_id),
    organizationExternalId: ticket.organization_id == null ? null : String(ticket.organization_id),
    channel: channel.channel,
    channelDetail: channel.detail,
    formExternalId: ticket.ticket_form_id == null ? null : String(ticket.ticket_form_id),
    brandExternalId: ticket.brand_id == null ? null : String(ticket.brand_id),
    customFields: toCustomFieldValues(ticket.custom_fields),
    createdAt: new Date(ticket.created_at),
    updatedAt: new Date(ticket.updated_at),
    deleted: ticket.status === "deleted",
  };
}

export function toComment(comment: ZendeskComment, users: Map<number, ZendeskUser>): ExternalComment {
  const author = users.get(comment.author_id);
  return {
    externalId: String(comment.id),
    body: comment.plain_body ?? comment.body,
    public: comment.public,
    author: {
      externalId: author ? String(author.id) : null,
      name: author?.name ?? "System",
      type: !author ? "system" : author.role === "end-user" ? "customer" : "agent",
    },
    createdAt: new Date(comment.created_at),
  };
}

export function indexUsers(users: ZendeskUser[] | undefined): Map<number, ZendeskUser> {
  return new Map((users ?? []).map((user) => [user.id, user]));
}

/** Non-empty custom field values by field ID. Zendesk returns every field, mostly empty. */
export function toCustomFieldValues(fields: ZendeskTicket["custom_fields"]): CustomFieldValues {
  const values: CustomFieldValues = {};
  for (const field of fields ?? []) {
    if (!isEmptyValue(field.value)) values[String(field.id)] = field.value;
  }
  return values;
}

/** Zendesk field types oneix shows, by oneix type. Built-in fields are left out. */
const FIELD_TYPES: Record<string, CustomFieldType> = {
  text: "text",
  textarea: "textarea",
  integer: "integer",
  decimal: "decimal",
  date: "date",
  checkbox: "checkbox",
  regexp: "regexp",
  tagger: "dropdown",
  multiselect: "multiselect",
  lookup: "lookup",
  partialcreditcard: "credit_card",
};

/** A custom ticket field, or null for built-in fields and types oneix doesn't show. */
export function toTicketField(field: ZendeskTicketField): ExternalTicketField | null {
  const type = FIELD_TYPES[field.type];
  if (!type || !field.removable) return null;
  return {
    id: String(field.id),
    type,
    title: field.title,
    description: field.agent_description || field.description || null,
    position: field.position,
    active: field.active,
    requiredOn: field.required ? ["solved"] : [],
    editable: field.agent_can_edit !== false,
    options: (field.custom_field_options ?? []).map((o) => ({
      name: o.name,
      value: o.value,
      allowSolving: o.allow_solving !== false,
    })),
    pattern: field.regexp_for_validation || null,
  };
}

/** Statuses a field can be required at; closed tickets can't be changed. */
const OPEN_STATUSES = TICKET_STATUSES.filter((s) => s !== "closed");

/** When a conditional child field is required. Older forms only say "required", meaning to solve. */
function requiredOn(isRequired: boolean | undefined, setting: ZendeskRequiredOnStatuses | undefined): TicketStatus[] {
  if (!setting) return isRequired ? ["solved"] : [];
  if (setting.type === "ALL_STATUSES") return [...OPEN_STATUSES];
  if (setting.type === "NO_STATUSES") return [];
  return (setting.statuses ?? [])
    .map((s) => fromZendeskStatus(s as ZendeskStatus))
    .filter((s) => s !== "closed");
}

export function toTicketForm(form: ZendeskTicketForm): ExternalTicketForm {
  return {
    id: String(form.id),
    name: form.name,
    position: form.position,
    isDefault: form.default,
    active: form.active,
    brandIds: form.in_all_brands ? null : (form.restricted_brand_ids ?? []).map(String),
    fieldIds: form.ticket_field_ids.map(String),
    conditions: (form.agent_conditions ?? []).map((c) => ({
      parentFieldId: String(c.parent_field_id),
      value: c.value,
      children: c.child_fields.map((child) => ({
        fieldId: String(child.id),
        requiredOn: requiredOn(child.is_required, child.required_on_statuses),
      })),
    })),
  };
}
