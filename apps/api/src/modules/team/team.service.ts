import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AccountError, inviteToTenant, issueLink, linkBackendAgent, type OneTimeLink } from "@oneix/accounts";
import type {
  BackendAgentOptionsResponse,
  BackendDirectoryResponse,
  BackendUser,
  InviteMemberRequest,
  InviteMemberResponse,
  OneTimeLinkResponse,
  TeamMember,
  TeamResponse,
  UpdateMemberRequest,
} from "@oneix/contracts";
import { type BackendAgent, type PrismaClient, scopedToTenant } from "@oneix/db";
import { type TicketingRegistry, upsertBackendAgent } from "@oneix/tenancy";
import { TicketingError } from "@oneix/ticketing";
import type { z } from "zod";
import type { SessionUser } from "../../common/auth.js";
import { PRISMA, TICKETING } from "../../common/providers.module.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuditService } from "../audit/audit.service.js";

type InviteInput = z.output<typeof InviteMemberRequest>;

function toBackendUser(agent: BackendAgent): BackendUser {
  return {
    externalId: agent.externalId,
    name: agent.name,
    email: agent.email,
    roles: agent.roleNames.length > 0 ? agent.roleNames : [agent.role === "admin" ? "Admin" : "Agent"],
    active: agent.active,
  };
}

/** Workspace admins manage who has access, their oneix role, and their Zendesk link. */
@Injectable()
export class TeamService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TICKETING) private readonly registry: TicketingRegistry,
    private readonly audit: AuditService,
  ) {}

  /** The roles and groups a new Zendesk agent can be given, read live from the workspace's Zendesk. */
  async agentOptions(admin: SessionUser): Promise<BackendAgentOptionsResponse> {
    const ticketing = await this.registry.for(admin.tenantId);
    const [roles, groups] = await Promise.all([ticketing.listAgentRoles(), ticketing.listGroups()]);
    return { roles, groups: groups.map((g) => ({ id: g.externalId, name: g.name })) };
  }

  async list(admin: SessionUser): Promise<TeamResponse> {
    const db = scopedToTenant(this.prisma, admin.tenantId);
    const [memberships, directory] = await Promise.all([
      db.tenantMembership.findMany({
        select: {
          userId: true,
          role: true,
          active: true,
          zendeskUserId: true,
          user: { select: { email: true, name: true, status: true, lastLoginAt: true } },
        },
        orderBy: { user: { name: "asc" } },
      }),
      db.backendAgent.findMany({ where: { provider: "zendesk" } }),
    ]);

    const byExternalId = new Map(directory.map((agent) => [agent.externalId, agent]));
    const linkedIds = new Set(memberships.flatMap((m) => (m.zendeskUserId ? [m.zendeskUserId] : [])));
    const unlinkedByEmail = new Map(
      directory
        .filter((agent) => agent.active && agent.email && !linkedIds.has(agent.externalId))
        .map((agent) => [agent.email!.toLowerCase(), agent]),
    );

    return {
      items: memberships.map((m) => {
        const linked = m.zendeskUserId ? byExternalId.get(m.zendeskUserId) : undefined;
        const suggestion = m.zendeskUserId ? undefined : unlinkedByEmail.get(m.user.email.toLowerCase());
        return {
          id: m.userId,
          name: m.user.name,
          email: m.user.email,
          account: m.user.status,
          active: m.active,
          role: m.role,
          linkedTo: linked ? toBackendUser(linked) : null,
          suggestedLink: suggestion ? toBackendUser(suggestion) : null,
          lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async directory(admin: SessionUser): Promise<BackendDirectoryResponse> {
    const db = scopedToTenant(this.prisma, admin.tenantId);
    const [agents, links] = await Promise.all([
      db.backendAgent.findMany({ where: { provider: "zendesk" }, orderBy: { name: "asc" } }),
      db.tenantMembership.findMany({ where: { zendeskUserId: { not: null } }, select: { userId: true, zendeskUserId: true } }),
    ]);
    const linkedTo = new Map(links.map((l) => [l.zendeskUserId!, l.userId]));
    return {
      items: agents.map((agent) => ({ ...toBackendUser(agent), linkedToMemberId: linkedTo.get(agent.externalId) ?? null })),
    };
  }

  async invite(admin: SessionUser, input: InviteInput): Promise<InviteMemberResponse> {
    const zendeskUserId = input.newZendeskAgent
      ? await this.createZendeskAgent(admin, input.name, input.email, input.newZendeskAgent)
      : (input.zendeskUserId ?? null);

    const result = await inviteToTenant(this.prisma, {
      tenantId: admin.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      zendeskUserId,
      createdById: admin.id,
    });
    await this.audit.record({
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: "team.invited",
      targetType: "user",
      targetId: result.userId,
      metadata: { role: input.role, zendeskUserId, createdZendeskAgent: input.newZendeskAgent !== undefined },
    });
    return { member: await this.member(admin, result.userId), link: result.link ? this.toLinkResponse(result.link) : null };
  }

  async update(admin: SessionUser, userId: string, changes: UpdateMemberRequest): Promise<TeamMember> {
    await this.member(admin, userId);
    if (userId === admin.id && (changes.role === "agent" || changes.active === false)) {
      throw new BadRequestException("You can't remove your own admin role or access. Ask another admin.");
    }

    if (changes.zendeskUserId !== undefined) {
      await linkBackendAgent(this.prisma, admin.tenantId, userId, changes.zendeskUserId);
    }
    if (changes.role !== undefined || changes.active !== undefined) {
      await this.prisma.tenantMembership.update({
        where: { tenantId_userId: { tenantId: admin.tenantId, userId } },
        data: { role: changes.role, active: changes.active },
      });
    }

    await this.audit.record({
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: "team.member_updated",
      targetType: "user",
      targetId: userId,
      metadata: { ...changes },
    });
    return this.member(admin, userId);
  }

  /** An invite link if they never set a password, otherwise a password reset link. */
  async issueLink(admin: SessionUser, userId: string): Promise<OneTimeLinkResponse> {
    const member = await this.member(admin, userId);
    if (member.account === "disabled") {
      throw new AccountError("account_disabled", "This person's oneix account is disabled.");
    }
    const link = await issueLink(this.prisma, {
      userId,
      purpose: member.account === "invited" ? "invite" : "password_reset",
      tenantId: admin.tenantId,
      createdById: admin.id,
    });
    await this.audit.record({
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: link.purpose === "invite" ? "team.invite_link_issued" : "team.reset_link_issued",
      targetType: "user",
      targetId: userId,
    });
    return this.toLinkResponse(link);
  }

  /**
   * Creates the agent in the workspace's Zendesk, adds them to the directory, and returns their ID.
   * Checked first, so a refused invite never leaves a stray Zendesk agent: the person mustn't already
   * be in the workspace, and their email mustn't already belong to a Zendesk agent (link them instead).
   */
  private async createZendeskAgent(
    admin: SessionUser,
    name: string,
    email: string,
    agent: NonNullable<InviteInput["newZendeskAgent"]>,
  ): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const member = await this.prisma.tenantMembership.findFirst({
      where: { tenantId: admin.tenantId, active: true, user: { email: normalized } },
      select: { id: true },
    });
    if (member) throw new ConflictException("This person is already in the workspace.");

    const existing = await this.prisma.backendAgent.findFirst({
      where: { tenantId: admin.tenantId, provider: "zendesk", email: normalized },
      select: { name: true },
    });
    if (existing) {
      throw new ConflictException(
        `${existing.name} is already a Zendesk user with this email. Pick them in "Zendesk user" instead of creating a new one.`,
      );
    }

    const ticketing = await this.registry.for(admin.tenantId);
    let created;
    try {
      created = await ticketing.createAgent({
        name,
        email: normalized,
        roleKey: agent.roleKey,
        groupExternalIds: agent.groupIds,
      });
    } catch (error) {
      // Zendesk's own reasons are useful here: a taken email, no free seat, an invalid role.
      if (error instanceof TicketingError && error.status === 422) {
        throw new BadRequestException(
          `Zendesk couldn't create the agent: ${error.reasons.join(" ") || "it rejected the request."}`,
        );
      }
      throw error;
    }

    await upsertBackendAgent(this.prisma, admin.tenantId, created);
    await this.audit.record({
      tenantId: admin.tenantId,
      actorId: admin.id,
      action: "team.zendesk_agent_created",
      targetType: "backend_agent",
      targetId: created.externalId,
      metadata: { email: normalized, roleKey: agent.roleKey, groupIds: agent.groupIds },
    });
    return created.externalId;
  }

  private async member(admin: SessionUser, userId: string): Promise<TeamMember> {
    const member = (await this.list(admin)).items.find((m) => m.id === userId);
    if (!member) throw new NotFoundException("That person isn't in this workspace");
    return member;
  }

  private toLinkResponse(link: OneTimeLink): OneTimeLinkResponse {
    const path = link.purpose === "invite" ? "invite" : "reset-password";
    return {
      url: `${this.config.WEB_ORIGIN}/${path}/${link.token}`,
      purpose: link.purpose,
      expiresAt: link.expiresAt.toISOString(),
    };
  }
}
