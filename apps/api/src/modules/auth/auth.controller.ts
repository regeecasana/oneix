import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  AcceptInviteRequest,
  ChangePasswordRequest,
  DevDirectory,
  DevLoginRequest,
  LinkDetails,
  LoginRequest,
  Me,
  ResetPasswordRequest,
  SwitchTenantRequest,
} from "@oneix/contracts";
import type { PrismaClient } from "@oneix/db";
import type { Request, Response } from "express";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { CurrentUser, Public, type SessionUser } from "../../common/auth.js";
import { PRISMA } from "../../common/providers.module.js";
import { SessionStore } from "../../common/session.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuthService } from "./auth.service.js";

const tenantFields = { id: true, slug: true, name: true } as const;

/**
 * oneix accounts sign in with their own email and password, never their Zendesk login.
 * Accounts are invited by an admin; the invite link sets the password. Sessions are stored
 * server-side and name the workspace being worked in.
 */
@ApiTags("Sign-in")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly sessions: SessionStore,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Sign in",
    description:
      "Email and password of a oneix account. Opens the workspace used last. After five wrong passwords the account " +
      "locks for 15 minutes.",
  })
  @ApiOkResponse({ description: "Signed in; the session cookie is set.", standardSchema: Me })
  @ApiErrors(400, 401, 403, 429)
  async login(
    @Body({ schema: LoginRequest }) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { userId, tenantId } = await this.auth.signIn(body.email, body.password, request.ip ?? "unknown");
    await this.sessions.start(request, response, userId, tenantId);
    return this.auth.me(userId, tenantId);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Sign out", description: "Ends the session on the server and clears the cookie." })
  @ApiNoContentResponse({ description: "Signed out." })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.sessions.end(request, response);
  }

  @Get("me")
  @ApiOperation({
    summary: "The signed-in agent",
    description: "Includes the current workspace, all workspaces they can switch to, their roles, and permissions.",
  })
  @ApiSession()
  @ApiOkResponse({ standardSchema: Me })
  current(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.auth.me(user.id, user.tenantId);
  }

  @Post("switch-tenant")
  @HttpCode(200)
  @ApiOperation({ summary: "Switch workspace", description: "Moves the session to another workspace the agent belongs to." })
  @ApiSession(400, 403)
  @ApiOkResponse({ standardSchema: Me })
  async switchTenant(
    @CurrentUser() user: SessionUser,
    @Body({ schema: SwitchTenantRequest }) body: SwitchTenantRequest,
  ): Promise<Me> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: user.id, active: true, tenant: { slug: body.tenant } },
      select: { tenantId: true },
    });
    if (!membership) throw new ForbiddenException("You don't have access to that workspace");

    await this.sessions.switchTenant(user.sessionId, membership.tenantId);
    return this.auth.me(user.id, membership.tenantId);
  }

  @Post("password")
  @HttpCode(204)
  @ApiOperation({
    summary: "Change password",
    description: "Needs the current password. Other sessions of the account end; this one stays signed in.",
  })
  @ApiSession(400, 403)
  @ApiNoContentResponse({ description: "Password changed." })
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body({ schema: ChangePasswordRequest }) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.auth.changePassword(user.id, user.tenantId, body.currentPassword, body.newPassword);
    await this.sessions.endAllFor(user.id, user.sessionId);
  }

  @Public()
  @Get("links/:token")
  @ApiOperation({
    summary: "Check an invite or password reset link",
    description: "Who and what the link is for, so the page can greet the person before they set a password.",
  })
  @ApiParam({ name: "token", description: "The token from the link." })
  @ApiOkResponse({ standardSchema: LinkDetails })
  @ApiErrors(400)
  linkDetails(@Param("token") token: string): Promise<LinkDetails> {
    return this.auth.linkDetails(token);
  }

  @Public()
  @Post("invites/accept")
  @HttpCode(200)
  @ApiOperation({
    summary: "Accept an invite",
    description: "Sets the account's password (and optionally its name) from an invite link, activates it, and signs in.",
  })
  @ApiOkResponse({ description: "Signed in; the session cookie is set.", standardSchema: Me })
  @ApiErrors(400, 403)
  async acceptInvite(
    @Body({ schema: AcceptInviteRequest }) body: AcceptInviteRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { userId, tenantId } = await this.auth.completeLink("invite", body);
    await this.sessions.start(request, response, userId, tenantId);
    return this.auth.me(userId, tenantId);
  }

  @Public()
  @Post("password-reset")
  @HttpCode(200)
  @ApiOperation({
    summary: "Reset password",
    description: "Sets a new password from a reset link, ends every other session, and signs in.",
  })
  @ApiOkResponse({ description: "Signed in; the session cookie is set.", standardSchema: Me })
  @ApiErrors(400, 403)
  async resetPassword(
    @Body({ schema: ResetPasswordRequest }) body: ResetPasswordRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { userId, tenantId } = await this.auth.completeLink("password_reset", body);
    await this.sessions.start(request, response, userId, tenantId);
    return this.auth.me(userId, tenantId);
  }

  @Public()
  @Get("dev-directory")
  @ApiOperation({
    summary: "List workspaces and accounts for development sign-in",
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
          where: { active: true, user: { status: { not: "disabled" } } },
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
    summary: "Sign in as any account (development)",
    description: "No password. Only when AUTH_DEV_LOGIN is on; refused in production.",
  })
  @ApiOkResponse({ description: "Signed in; the session cookie is set.", standardSchema: Me })
  @ApiErrors(400, 401, 404)
  async devLogin(
    @Body({ schema: DevLoginRequest }) body: DevLoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    this.assertDevLogin();
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        active: true,
        tenant: { slug: body.tenant },
        user: { email: body.email.toLowerCase(), status: { not: "disabled" } },
      },
      select: { tenantId: true, userId: true },
    });
    if (!membership) throw new UnauthorizedException();

    await this.sessions.start(request, response, membership.userId, membership.tenantId);
    return this.auth.me(membership.userId, membership.tenantId);
  }

  private assertDevLogin(): void {
    if (!this.config.AUTH_DEV_LOGIN) throw new NotFoundException();
  }
}
