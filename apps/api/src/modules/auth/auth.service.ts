import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AccountError,
  decoyHash,
  findLink,
  hashPassword,
  passwordProblem,
  setPasswordWithLink,
  verifyPassword,
} from "@oneix/accounts";
import type { LinkDetails, Me, TenantRef } from "@oneix/contracts";
import type { AuthTokenPurpose, PrismaClient } from "@oneix/db";
import { createLogger } from "@oneix/logger";
import { PRISMA } from "../../common/providers.module.js";
import { AuditService } from "../audit/audit.service.js";

const logger = createLogger("api.auth");

/** Consecutive failures before an account locks, and for how long. */
const MAX_FAILED_SIGN_INS = 5;
const LOCK_MS = 15 * 60 * 1000;
/** Sign-in attempts allowed per address in a window, across accounts. */
const ADDRESS_LIMIT = 30;
const ADDRESS_WINDOW_MS = 15 * 60 * 1000;

const tenantFields = { id: true, slug: true, name: true } as const;
const WRONG_CREDENTIALS = "Email or password is incorrect.";

@Injectable()
export class AuthService {
  /**
   * Recent attempts per address. In memory, so per API instance; it slows down guessing across
   * many accounts, while the per-account lock below is stored and holds everywhere.
   */
  private readonly attempts = new Map<string, number[]>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /** Checks the email and password and returns the account and the workspace to open. */
  async signIn(email: string, password: string, address: string): Promise<{ userId: string; tenantId: string }> {
    this.countAttempt(address);

    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, status: true, passwordHash: true, failedLogins: true, lockedUntil: true },
    });

    // An unknown email costs as much time as a wrong password, so timing doesn't reveal accounts.
    if (!user?.passwordHash || user.status !== "active") {
      await verifyPassword(password, await decoyHash());
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        { statusCode: 429, message: `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      const failedLogins = user.failedLogins + 1;
      const locks = failedLogins >= MAX_FAILED_SIGN_INS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: locks ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins },
      });
      if (locks) logger.warn({ userId: user.id }, "account locked after repeated failed sign-ins");
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    const tenantId = await this.workspaceToOpen(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.record({ tenantId, actorId: user.id, action: "auth.signed_in", targetType: "user", targetId: user.id });
    return { userId: user.id, tenantId };
  }

  /** What a one-time link is for, to show before the password is set. */
  async linkDetails(token: string): Promise<LinkDetails> {
    const link = (await findLink(this.prisma, token, "invite")) ?? (await findLink(this.prisma, token, "password_reset"));
    if (!link) throw new AccountError("invalid_link", "This link has expired or was already used. Ask your admin for a new one.");
    const tenant = link.tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { name: true } })
      : null;
    return {
      purpose: link.purpose,
      email: link.user.email,
      name: link.user.name,
      tenantName: tenant?.name ?? null,
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  /** Sets the password from an invite or reset link and returns where to sign the person in. */
  async completeLink(
    purpose: AuthTokenPurpose,
    input: { token: string; password: string; name?: string },
  ): Promise<{ userId: string; tenantId: string }> {
    const { userId, tenantId } = await setPasswordWithLink(this.prisma, { purpose, ...input });
    const workspace = tenantId ?? (await this.workspaceToOpen(userId));
    await this.audit.record({
      tenantId: workspace,
      actorId: userId,
      action: purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset",
      targetType: "user",
      targetId: userId,
    });
    return { userId, tenantId: workspace };
  }

  async changePassword(userId: string, tenantId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ForbiddenException("Your current password is incorrect.");
    }
    const problem = passwordProblem(newPassword, user.email);
    if (problem) throw new AccountError("weak_password", problem);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
    });
    await this.audit.record({ tenantId, actorId: userId, action: "auth.password_changed", targetType: "user", targetId: userId });
  }

  /** The signed-in agent, their current workspace, and every workspace they can switch to. */
  async me(userId: string, tenantId: string): Promise<Me> {
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
            zendeskUserId: true,
            tenant: { select: tenantFields },
          },
          orderBy: { tenant: { name: "asc" } },
        },
      },
    });
    const current = user.memberships.find((m) => m.tenantId === tenantId);
    if (!current) throw new UnauthorizedException();

    const tenants: TenantRef[] = user.memberships.map((m) => m.tenant);
    const linked = current.zendeskUserId !== null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: current.role,
      roles: current.roleNames,
      tenant: current.tenant,
      tenants,
      permissions: { publicReplies: linked && current.canReplyPublicly, linked },
    };
  }

  /** The workspace a sign-in opens: the last one used, else the first by name. */
  private async workspaceToOpen(userId: string): Promise<string> {
    const lastSession = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true },
    });
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId, active: true },
      select: { tenantId: true },
      orderBy: { tenant: { name: "asc" } },
    });
    const tenantId =
      memberships.find((m) => m.tenantId === lastSession?.tenantId)?.tenantId ?? memberships[0]?.tenantId;
    if (!tenantId) throw new ForbiddenException("Your account doesn't have access to any workspace yet.");
    return tenantId;
  }

  private countAttempt(address: string): void {
    const now = Date.now();
    const recent = (this.attempts.get(address) ?? []).filter((at) => now - at < ADDRESS_WINDOW_MS);
    if (recent.length >= ADDRESS_LIMIT) {
      throw new HttpException(
        { statusCode: 429, message: "Too many sign-in attempts. Wait a few minutes and try again." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.attempts.set(address, recent);
  }
}
