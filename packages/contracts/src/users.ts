import { z } from "zod";

export const USER_ROLES = ["agent", "admin"] as const;
export const UserRole = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRole>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRole,
});
export type Agent = z.infer<typeof Agent>;

export const ListAgentsResponse = z.object({ items: z.array(Agent) });
export type ListAgentsResponse = z.infer<typeof ListAgentsResponse>;
