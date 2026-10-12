import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient, TicketAccess, UserRole } from "@oneix/db";
import type { Request } from "express";
import { PRISMA } from "./providers.module.js";
import { SessionStore } from "./session.js";

/** The signed-in agent and the tenant they are working in, attached to every authenticated request. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** The session, for switching workspace or signing out. */
  sessionId: string;
  tenantId: string;
  /** oneix role in this tenant. */
  role: UserRole;
  /** The linked user in this tenant's ticketing backend; null until an admin links one. */
  zendeskUserId: string | null;
  canReplyPublicly: boolean;
  /** Which tickets the agent may see, mirrored from the backend. */
  ticketAccess: TicketAccess;
  groupExternalIds: string[];
  organizationExternalIds: string[];
}

type AuthedRequest = Request & { sessionUser?: SessionUser };

const IS_PUBLIC = "oneix:isPublic";
const REQUIRED_ROLE = "oneix:requiredRole";

/** Skips the session check, for health, webhooks, and sign-in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only workspace admins may call this. */
export const AdminOnly = () => SetMetadata(REQUIRED_ROLE, "admin" satisfies UserRole);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().sessionUser;
  if (!user) throw new UnauthorizedException();
  return user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.sessions.resolve(request);
    if (!session) throw new UnauthorizedException();

    // Account and workspace access are re-checked on every request, so turning someone off,
    // or removing their linked user in the backend, takes effect at once.
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
      select: {
        role: true,
        zendeskUserId: true,
        canReplyPublicly: true,
        ticketAccess: true,
        groupExternalIds: true,
        organizationExternalIds: true,
        active: true,
        user: { select: { email: true, name: true, status: true } },
      },
    });
    if (!membership?.active || membership.user.status === "disabled") throw new UnauthorizedException();

    request.sessionUser = {
      id: session.userId,
      email: membership.user.email,
      name: membership.user.name,
      sessionId: session.id,
      tenantId: session.tenantId,
      role: membership.role,
      zendeskUserId: membership.zendeskUserId,
      canReplyPublicly: membership.canReplyPublicly,
      ticketAccess: membership.ticketAccess,
      groupExternalIds: membership.groupExternalIds,
      organizationExternalIds: membership.organizationExternalIds,
    };

    const requiredRole = this.reflector.getAllAndOverride<UserRole | undefined>(REQUIRED_ROLE, targets);
    if (requiredRole === "admin" && membership.role !== "admin") {
      throw new ForbiddenException("Only workspace admins can do this");
    }
    return true;
  }
}
