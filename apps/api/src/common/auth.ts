import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient, UserRole } from "@oneix/db";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { PRISMA } from "./providers.module.js";
import { SESSION_COOKIE, verifySession } from "./session.js";

/** The signed-in agent and the tenant they are working in, attached to every authenticated request. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  /** Role in this tenant. */
  role: UserRole;
  /** The agent's user ID in this tenant's ticketing backend. */
  zendeskUserId: string | null;
  canReplyPublicly: boolean;
}

type AuthedRequest = Request & { sessionUser?: SessionUser };

const IS_PUBLIC = "oneix:isPublic";

/** Skips the session check, for health, webhooks, and sign-in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().sessionUser;
  if (!user) throw new UnauthorizedException();
  return user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    const session = typeof token === "string" ? verifySession(token, this.config.SESSION_SECRET) : null;
    if (!session) throw new UnauthorizedException();

    // Access is re-checked on every request, so removing an agent in the backend takes effect at once.
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: session.tid, userId: session.sub } },
      select: {
        role: true,
        zendeskUserId: true,
        canReplyPublicly: true,
        active: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (!membership?.active) throw new UnauthorizedException();

    request.sessionUser = {
      id: session.sub,
      email: membership.user.email,
      name: membership.user.name,
      tenantId: session.tid,
      role: membership.role,
      zendeskUserId: membership.zendeskUserId,
      canReplyPublicly: membership.canReplyPublicly,
    };
    return true;
  }
}
