import { Inject, Injectable } from "@nestjs/common";
import { hashToken, newToken } from "@oneix/accounts";
import type { PrismaClient } from "@oneix/db";
import type { Request, Response } from "express";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { PRISMA } from "./providers.module.js";

export const SESSION_COOKIE = "oneix_session";
/** A session lasts a working day; signing in again starts a new one. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** lastSeenAt is refreshed at most this often, to keep reads cheap. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface ActiveSession {
  id: string;
  userId: string;
  tenantId: string;
}

/**
 * Server-side sessions. The cookie holds a random token and only its hash is stored, so a leaked
 * database can't be used to sign in, and signing out, resetting a password, or turning an account
 * off ends sessions at once.
 */
@Injectable()
export class SessionStore {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async start(request: Request, response: Response, userId: string, tenantId: string): Promise<void> {
    const { token, hash } = newToken();
    await this.prisma.session.create({
      data: {
        tokenHash: hash,
        userId,
        tenantId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ip: request.ip ?? null,
        userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  /** The session behind the request's cookie, if it is still valid. */
  async resolve(request: Request): Promise<ActiveSession | null> {
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length === 0) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, tenantId: true, expiresAt: true, revokedAt: true, lastSeenAt: true },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }
    return { id: session.id, userId: session.userId, tenantId: session.tenantId };
  }

  async switchTenant(sessionId: string, tenantId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { tenantId } });
  }

  /** Ends the request's session and clears its cookie. */
  async end(request: Request, response: Response): Promise<void> {
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token === "string" && token.length > 0) {
      await this.prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  /** Ends every session of a user, except optionally one. */
  async endAllFor(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
