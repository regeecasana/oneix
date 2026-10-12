import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  BackendAgentOptionsResponse,
  BackendDirectoryResponse,
  InviteMemberRequest,
  InviteMemberResponse,
  OneTimeLinkResponse,
  TeamMember,
  TeamResponse,
  UpdateMemberRequest,
} from "@oneix/contracts";
import type { z } from "zod";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { AdminOnly, CurrentUser, type SessionUser } from "../../common/auth.js";
import { TeamService } from "./team.service.js";

const memberId = ApiParam({ name: "userId", description: "The person's oneix account ID, from the team list." });

@ApiTags("Team")
@ApiSession(403)
@AdminOnly()
@Controller("team")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @ApiOperation({
    summary: "List the workspace's people",
    description:
      "Every oneix account with access to the workspace: account status, oneix role, the linked Zendesk user, " +
      "and a suggested link (a Zendesk user with the same email) when none is linked. Admins only.",
  })
  @ApiOkResponse({ standardSchema: TeamResponse })
  list(@CurrentUser() admin: SessionUser): Promise<TeamResponse> {
    return this.team.list(admin);
  }

  @Get("directory")
  @ApiOperation({
    summary: "List the workspace's Zendesk users",
    description: "The Zendesk agents and admins from the hourly sync, and which account each is linked to. Admins only.",
  })
  @ApiOkResponse({ standardSchema: BackendDirectoryResponse })
  directory(@CurrentUser() admin: SessionUser): Promise<BackendDirectoryResponse> {
    return this.team.directory(admin);
  }

  @Get("zendesk-options")
  @ApiOperation({
    summary: "Roles and groups for a new Zendesk agent",
    description: "Read live from the workspace's Zendesk: Admin and the custom roles (or Agent), and the groups. Admins only.",
  })
  @ApiOkResponse({ standardSchema: BackendAgentOptionsResponse })
  @ApiErrors(502, 503)
  agentOptions(@CurrentUser() admin: SessionUser): Promise<BackendAgentOptionsResponse> {
    return this.team.agentOptions(admin);
  }

  @Post("invites")
  @ApiOperation({
    summary: "Invite someone",
    description:
      "Gives a person access to the workspace with a oneix role, linked to an existing Zendesk user, to a new " +
      "Zendesk agent created now (`newZendeskAgent`: verified, so Zendesk emails them nothing), or not linked. " +
      "A new person gets an invite link to set their password; there is no email sending yet, so send it yourself.",
  })
  @ApiCreatedResponse({ standardSchema: InviteMemberResponse })
  @ApiErrors(400, 404, 409, 502, 503)
  invite(
    @CurrentUser() admin: SessionUser,
    @Body({ schema: InviteMemberRequest }) body: z.output<typeof InviteMemberRequest>,
  ): Promise<InviteMemberResponse> {
    return this.team.invite(admin, body);
  }

  @Patch("members/:userId")
  @ApiOperation({
    summary: "Change role, Zendesk link, or access",
    description:
      "Link to a Zendesk user from the directory (copying their permissions), unlink with null, change the oneix " +
      "role, or turn access to this workspace on or off. Admins can't demote or turn off themselves.",
  })
  @memberId
  @ApiOkResponse({ standardSchema: TeamMember })
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() admin: SessionUser,
    @Param("userId") userId: string,
    @Body({ schema: UpdateMemberRequest }) body: UpdateMemberRequest,
  ): Promise<TeamMember> {
    return this.team.update(admin, userId, body);
  }

  @Post("members/:userId/link")
  @ApiOperation({
    summary: "Create an invite or password reset link",
    description:
      "An invite link if they never set a password, otherwise a password reset link. Earlier links stop working.",
  })
  @memberId
  @ApiCreatedResponse({ standardSchema: OneTimeLinkResponse })
  @ApiErrors(404, 409)
  issueLink(@CurrentUser() admin: SessionUser, @Param("userId") userId: string): Promise<OneTimeLinkResponse> {
    return this.team.issueLink(admin, userId);
  }
}
