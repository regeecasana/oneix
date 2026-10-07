import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Res, UnauthorizedException } from "@nestjs/common";
import { type Agent, DevLoginRequest, type ListAgentsResponse, type Me } from "@oneix/contracts";
import type { PrismaClient } from "@oneix/db";
import type { Response } from "express";
import { CurrentUser, Public, type SessionUser } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "../../common/session.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";

const agentFields = { id: true, name: true, email: true, role: true } as const;

/**
 * Development sign-in: pick a seeded agent, no password.
 * Replaced by SSO (Auth.js, OIDC) once the identity provider is chosen.
 */
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Get("dev-users")
  async devUsers(): Promise<ListAgentsResponse> {
    this.assertDevLogin();
    const items = await this.prisma.user.findMany({
      where: { tenantId: this.config.TENANT_ID },
      select: agentFields,
      orderBy: { name: "asc" },
    });
    return { items };
  }

  @Public()
  @Post("dev-login")
  @HttpCode(200)
  async devLogin(
    @Body(new ZodPipe(DevLoginRequest)) body: DevLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    this.assertDevLogin();
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: this.config.TENANT_ID, email: body.email } },
      select: { ...agentFields, tenantId: true },
    });
    if (!user) throw new UnauthorizedException();

    const token = signSession(
      { sub: user.id, tid: user.tenantId, exp: Date.now() + SESSION_TTL_MS },
      this.config.SESSION_SECRET,
    );
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
    return toAgent(user);
  }

  @Get("me")
  me(@CurrentUser() user: SessionUser): Me {
    return toAgent(user);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  private assertDevLogin(): void {
    if (!this.config.AUTH_DEV_LOGIN) throw new NotFoundException();
  }
}

function toAgent(user: Agent): Agent {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
