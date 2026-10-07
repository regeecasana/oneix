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

/** The signed-in agent, attached to every authenticated request. */
export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  zendeskUserId: string | null;
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

    const user = await this.prisma.user.findFirst({
      where: { id: session.sub, tenantId: session.tid },
      select: { id: true, tenantId: true, email: true, name: true, role: true, zendeskUserId: true },
    });
    if (!user) throw new UnauthorizedException();

    request.sessionUser = user;
    return true;
  }
}
