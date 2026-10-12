import { z } from "zod";
import { Agent } from "./users.js";

export const TenantRef = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type TenantRef = z.infer<typeof TenantRef>;

/** What the agent may do in the current tenant, mirrored from its ticketing backend. */
export const AgentPermissions = z.object({
  /** False for agents limited to internal notes, such as light agents. */
  publicReplies: z.boolean(),
  /** False until an admin links the account to a ticketing backend user; until then it can't act on tickets. */
  linked: z.boolean(),
});
export type AgentPermissions = z.infer<typeof AgentPermissions>;

/** The signed-in agent, the tenant they are working in, and every tenant they can switch to. */
export const Me = Agent.extend({
  tenant: TenantRef,
  tenants: z.array(TenantRef),
  permissions: AgentPermissions,
});
export type Me = z.infer<typeof Me>;

export const DevLoginRequest = z.object({
  email: z.email(),
  /** Tenant slug. */
  tenant: z.string().min(1),
});
export type DevLoginRequest = z.infer<typeof DevLoginRequest>;

export const SwitchTenantRequest = z.object({
  /** Tenant slug. */
  tenant: z.string().min(1),
});
export type SwitchTenantRequest = z.infer<typeof SwitchTenantRequest>;

/** Development sign-in: every tenant with its active agents. */
export const DevDirectory = z.object({
  tenants: z.array(TenantRef.extend({ agents: z.array(Agent) })),
});
export type DevDirectory = z.infer<typeof DevDirectory>;

/** Accounts sign in with email and password; passwords are at least 12 characters. */
export const PASSWORD_MIN_LENGTH = 12;
const NewPassword = z.string().min(PASSWORD_MIN_LENGTH).max(256);

export const LoginRequest = z.object({
  email: z.email(),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** What an invite or reset link is for, shown before the password is set. */
export const LinkDetails = z.object({
  purpose: z.enum(["invite", "password_reset"]),
  email: z.string(),
  name: z.string(),
  /** The workspace an invitation is for. */
  tenantName: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export type LinkDetails = z.infer<typeof LinkDetails>;

export const AcceptInviteRequest = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  password: NewPassword,
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

export const ResetPasswordRequest = z.object({
  token: z.string().min(1),
  password: NewPassword,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: NewPassword,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;
