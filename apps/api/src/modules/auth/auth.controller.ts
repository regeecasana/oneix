import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevDirectory, DevLoginRequest, Me, SwitchTenantRequest, type TenantRef } from "@oneix/contracts";
import type { PrismaClient } from "@oneix/db";
import type { Response } from "express";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { CurrentUser, Public, type SessionUser } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "../../common/session.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";

const tenantFields = { id: true, slug: true, name: true } as const;

/**
 * Sessions are per tenant: the cookie names the user and the tenant they are working in.
 * Development sign-in picks a tenant and an agent, no password. SSO replaces it once the identity
 * provider is chosen.
 */
@ApiTags("Sign-in")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Get("dev-directory")
  @ApiOperation({
    summary: "List workspaces and agents for development sign-in",
    description: "Only when AUTH_DEV_LOGIN is on; otherwise 404. Never available in production.",
  })
  @ApiOkResponse({ standardSchema: DevDirectory })
  @ApiErrors(404)
  async devDirectory(): Promise<DevDirectory> {
    this.assertDevLogin();
    const tenants = await this.prisma.tenant.findMany({
      select: {
        ...tenantFields,
        memberships: {
          where: { active: true },
          select: { role: true, roleNames: true, user: { select: { id: true, name: true, email: true } } },
          orderBy: { user: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });
    return {
      tenants: tenants.map(({ memberships, ...tenant }) => ({
        ...tenant,
        agents: memberships.map((m) => ({ ...m.user, role: m.role, roles: m.roleNames })),
      })),
    };
  }

  @Public()
  @Post("dev-login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Sign in as an agent (development)",
    description: "Sets the session cookie for the agent in the given workspace. Only when AUTH_DEV_LOGIN is on.",
  })
  @ApiOkResponse({ description: "Signed in; the session cookie is set.", standardSchema: Me })
  @ApiErrors(400, 401, 404)
  async devLogin(
    @Body({ schema: DevLoginRequest }) body: DevLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    this.assertDevLogin();
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { active: true, tenant: { slug: body.tenant }, user: { email: body.email.toLowerCase() } },
      select: { tenantId: true, userId: true },
    });
    if (!membership) throw new UnauthorizedException();

    this.setSession(response, membership.userId, membership.tenantId);
    return this.me(membership.userId, membership.tenantId);
  }

  @Get("me")
  @ApiOperation({ summary: "The signed-in agent", description: "Includes the current workspace, all workspaces they can switch to, their roles, and permissions." })
  @ApiSession()
  @ApiOkResponse({ standardSchema: Me })
  current(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.me(user.id, user.tenantId);
  }

  /** Moves the session to another tenant the agent belongs to. */
  @Post("switch-tenant")
  @HttpCode(200)
  @ApiOperation({ summary: "Switch workspace", description: "Moves the session to another workspace the agent belongs to." })
  @ApiSession(400, 403)
  @ApiOkResponse({ standardSchema: Me })
  async switchTenant(
    @CurrentUser() user: SessionUser,
    @Body({ schema: SwitchTenantRequest }) body: SwitchTenantRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: user.id, active: true, tenant: { slug: body.tenant } },
      select: { tenantId: true },
    });
    if (!membership) throw new ForbiddenException("You don't have access to that workspace");

    this.setSession(response, user.id, membership.tenantId);
    return this.me(user.id, membership.tenantId);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Sign out", description: "Clears the session cookie." })
  @ApiNoContentResponse({ description: "Signed out." })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  private async me(userId: string, tenantId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { active: true },
          select: {
            tenantId: true,
            role: true,
            roleNames: true,
            canReplyPublicly: true,
            tenant: { select: tenantFields },
          },
          orderBy: { tenant: { name: "asc" } },
        },
      },
    });
    const current = user.memberships.find((m) => m.tenantId === tenantId);
    if (!current) throw new UnauthorizedException();

    const tenants: TenantRef[] = user.memberships.map((m) => m.tenant);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: current.role,
      roles: current.roleNames,
      tenant: current.tenant,
      tenants,
      permissions: { publicReplies: current.canReplyPublicly },
    };
  }

  private setSession(response: Response, userId: string, tenantId: string): void {
    const token = signSession({ sub: userId, tid: tenantId, exp: Date.now() + SESSION_TTL_MS }, this.config.SESSION_SECRET);
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  private assertDevLogin(): void {
    if (!this.config.AUTH_DEV_LOGIN) throw new NotFoundException();
  }
}
