import type { AuthTokenPurpose, PrismaClient, UserRole } from "@oneix/db";
import { AccountError } from "./errors.js";
import { linkBackendAgent } from "./links.js";
import { hashPassword, passwordProblem } from "./password.js";
import { hashToken, newToken } from "./tokens.js";

const HOUR = 60 * 60 * 1000;

/** How long one-time links stay valid. Without email, admins copy and send them, so allow a day. */
export const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  invite: 7 * 24 * HOUR,
  password_reset: 24 * HOUR,
};

export interface OneTimeLink {
  token: string;
  purpose: AuthTokenPurpose;
  expiresAt: Date;
}

/** Issues a one-time link for the user. Earlier unused links for the same purpose stop working. */
export async function issueLink(
  prisma: PrismaClient,
  input: { userId: string; purpose: AuthTokenPurpose; tenantId?: string; createdById?: string },
): Promise<OneTimeLink> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[input.purpose]);
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId: input.userId, purpose: input.purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: {
        tokenHash: hash,
        purpose: input.purpose,
        userId: input.userId,
        tenantId: input.tenantId,
        expiresAt,
        createdById: input.createdById,
      },
    }),
  ]);
  return { token, purpose: input.purpose, expiresAt };
}

export interface InviteInput {
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  /** Zendesk user to link the account to, from the tenant's directory. */
  zendeskUserId?: string | null;
  createdById?: string;
}

export interface InviteResult {
  userId: string;
  /** Null when the person already has an active oneix account: they were added to the workspace. */
  link: OneTimeLink | null;
}

/**
 * Gives a person access to a workspace. A new person gets an invited account and an invite link
 * to set their password; someone who already has an account is simply added.
 */
export async function inviteToTenant(prisma: PrismaClient, input: InviteInput): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: input.name.trim(), status: "invited" },
    update: {},
    select: { id: true, status: true },
  });
  if (user.status === "disabled") {
    throw new AccountError("account_disabled", "This person's oneix account is disabled.");
  }

  const existing = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
    select: { active: true },
  });
  if (existing?.active) {
    throw new AccountError("already_member", "This person is already in the workspace.");
  }

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
    create: { tenantId: input.tenantId, userId: user.id, role: input.role, canReplyPublicly: false, ticketAccess: "assigned" },
    update: { role: input.role, active: true },
  });
  if (input.zendeskUserId) {
    await linkBackendAgent(prisma, input.tenantId, user.id, input.zendeskUserId);
  }

  const link =
    user.status === "invited"
      ? await issueLink(prisma, { userId: user.id, purpose: "invite", tenantId: input.tenantId, createdById: input.createdById })
      : null;
  return { userId: user.id, link };
}

/** The account a valid, unused link belongs to, or null. Does not use the link up. */
export async function findLink(prisma: PrismaClient, token: string, purpose: AuthTokenPurpose) {
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, status: true } } },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
  if (row.user.status === "disabled") return null;
  return row;
}

/**
 * Sets a password from an invite or reset link, uses the link up, and activates the account.
 * Every other session ends, so a reset also signs out a browser someone else may hold.
 */
export async function setPasswordWithLink(
  prisma: PrismaClient,
  input: { token: string; purpose: AuthTokenPurpose; password: string; name?: string },
): Promise<{ userId: string; tenantId: string | null }> {
  const link = await findLink(prisma, input.token, input.purpose);
  if (!link) throw new AccountError("invalid_link", "This link has expired or was already used. Ask your admin for a new one.");

  const problem = passwordProblem(input.password, link.user.email);
  if (problem) throw new AccountError("weak_password", problem);

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: link.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        status: "active",
        failedLogins: 0,
        lockedUntil: null,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      },
    }),
    prisma.authToken.update({ where: { id: link.id }, data: { usedAt: now } }),
    prisma.session.updateMany({ where: { userId: link.userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  return { userId: link.userId, tenantId: link.tenantId };
}
