import { z } from "zod";
import { UserRole } from "./users.js";

/** A user in the workspace's ticketing backend (Zendesk), from the synced directory. */
export const BackendUser = z.object({
  externalId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  /** The backend's role names, primary first: "Admin", "Light agent", "Moderator". */
  roles: z.array(z.string()),
  /** False when suspended or removed in the backend. */
  active: z.boolean(),
});
export type BackendUser = z.infer<typeof BackendUser>;

export const AccountStatus = z.enum(["invited", "active", "disabled"]);
export type AccountStatus = z.infer<typeof AccountStatus>;

/** A oneix account with access to the workspace. */
export const TeamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** invited until they set a password from their invite link. */
  account: AccountStatus,
  /** Access to this workspace; off when an admin turned it off or the linked backend user was removed. */
  active: z.boolean(),
  /** oneix role in this workspace. */
  role: UserRole,
  /** The linked backend user; null means the account can sign in but not act on tickets. */
  linkedTo: BackendUser.nullable(),
  /** An unlinked backend user with the same email, to confirm with one click. */
  suggestedLink: BackendUser.nullable(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type TeamMember = z.infer<typeof TeamMember>;

export const TeamResponse = z.object({ items: z.array(TeamMember) });
export type TeamResponse = z.infer<typeof TeamResponse>;

/** The backend directory, with which oneix account each user is linked to. */
export const BackendDirectoryResponse = z.object({
  items: z.array(BackendUser.extend({ linkedToMemberId: z.string().nullable() })),
});
export type BackendDirectoryResponse = z.infer<typeof BackendDirectoryResponse>;

/** A new agent to create in the workspace's ticketing backend for the person being invited. */
export const NewBackendAgent = z.object({
  /** A role key from the backend options: "admin", "agent", or "custom:<id>". */
  roleKey: z.string().min(1),
  groupIds: z.array(z.string().min(1)).default([]),
});
export type NewBackendAgent = z.input<typeof NewBackendAgent>;

export const InviteMemberRequest = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(120),
    role: UserRole.default("agent"),
    /** Existing backend user to link the account to; omit to link later. */
    zendeskUserId: z.string().min(1).nullable().optional(),
    /** Or: create a new agent in the backend and link the account to it. */
    newZendeskAgent: NewBackendAgent.optional(),
  })
  .refine((v) => !(v.zendeskUserId && v.newZendeskAgent), {
    message: "Link an existing Zendesk user or create a new one, not both",
  });
export type InviteMemberRequest = z.input<typeof InviteMemberRequest>;

/** A one-time link for the person; there is no email sending yet, so the admin sends it. */
export const OneTimeLinkResponse = z.object({
  url: z.string(),
  purpose: z.enum(["invite", "password_reset"]),
  expiresAt: z.iso.datetime(),
});
export type OneTimeLinkResponse = z.infer<typeof OneTimeLinkResponse>;

export const InviteMemberResponse = z.object({
  member: TeamMember,
  /** Null when the person already had a oneix account and was simply added. */
  link: OneTimeLinkResponse.nullable(),
});
export type InviteMemberResponse = z.infer<typeof InviteMemberResponse>;

export const UpdateMemberRequest = z
  .object({
    role: UserRole.optional(),
    /** Backend user to link to, or null to unlink. */
    zendeskUserId: z.string().min(1).nullable().optional(),
    /** Turns the person's access to this workspace on or off. */
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes given" });
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequest>;

/** What a new backend agent can be given: roles and groups. */
export const BackendAgentOptionsResponse = z.object({
  roles: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      /** False for roles limited to internal notes, such as light agents. */
      publicReplies: z.boolean(),
    }),
  ),
  groups: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type BackendAgentOptionsResponse = z.infer<typeof BackendAgentOptionsResponse>;
