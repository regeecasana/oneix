import { z } from "zod";
import { Agent } from "./users.js";

export const Me = Agent;
export type Me = z.infer<typeof Me>;

export const DevLoginRequest = z.object({ email: z.email() });
export type DevLoginRequest = z.infer<typeof DevLoginRequest>;
