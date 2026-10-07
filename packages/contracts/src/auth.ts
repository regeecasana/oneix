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
