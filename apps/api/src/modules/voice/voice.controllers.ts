import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  type MessageEvent,
  Param,
  Post,
  Put,
  type RawBodyRequest,
  Req,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  FlowAckResponse,
  FlowCallStartRequest,
  FlowCallStartResponse,
  FlowHandoverRequest,
  FlowHandoverResponse,
  LiveCall,
  LiveCallsResponse,
  PresenceResponse,
  SetPresenceRequest,
  WidgetCallRequest,
  WidgetCallResponse,
} from "@oneix/contracts";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { CurrentUser, Public, type SessionUser } from "../../common/auth.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { FlowSecretGuard } from "./flow-secret.guard.js";
import { PresenceService } from "./presence.service.js";
import { type DigestChallengeResponse, digestMatches, gatewaySignatureMatches } from "./sip-auth.js";
import { VoiceCallsService } from "./voice-calls.service.js";
import { VoiceEventsService } from "./voice-events.service.js";

/** Client websites start calls here. Public, rate-limited, and allowed only from WIDGET_ORIGINS. */
@ApiTags("Voice")
@Public()
@Controller("widget")
export class WidgetController {
  constructor(private readonly calls: VoiceCallsService) {}

  @Post("calls")
  @ApiOperation({
    summary: "Start a website call",
    description:
      "Finds or creates the customer by email, opens a Zendesk ticket for the call, and returns the call token " +
      "to pass as `userId` to the Click To Call SDK. Up to 10 calls per address every 10 minutes.",
  })
  @ApiOkResponse({ standardSchema: WidgetCallResponse })
  @ApiErrors(400, 404, 429, 502)
  start(@Body({ schema: WidgetCallRequest }) body: WidgetCallRequest, @Req() request: Request): Promise<WidgetCallResponse> {
    return this.calls.startFromWidget(body, request.ip ?? "unknown");
  }
}

/** The Cognigy Flow reports the call's progress here, with the call token from `input.userId`. */
@ApiTags("Voice")
@ApiBearerAuth()
@Public()
@UseGuards(FlowSecretGuard)
@Controller("voice/flow/calls/:token")
export class FlowController {
  constructor(private readonly calls: VoiceCallsService) {}

  @Post("start")
  @HttpCode(200)
  @ApiOperation({
    summary: "The AI agent answered",
    description: "Marks the call live in the workspace. Returns the ticket number and the caller's name for the greeting.",
  })
  @ApiOkResponse({ standardSchema: FlowCallStartResponse })
  @ApiErrors(401, 404)
  start(
    @Param("token") token: string,
    @Body({ schema: FlowCallStartRequest }) body: FlowCallStartRequest,
  ): Promise<FlowCallStartResponse> {
    return this.calls.flowStart(token, body);
  }

  @Post("handover")
  @HttpCode(200)
  @ApiOperation({
    summary: "Hand the call over to an agent",
    description:
      "Adds the transcript to the ticket as an internal note and returns the available agents' softphones, to " +
      "ring at once with a Voice Gateway dial, with the SIP headers and ring timeout to use. `targets` is empty " +
      "when nobody is available.",
  })
  @ApiOkResponse({ standardSchema: FlowHandoverResponse })
  @ApiErrors(401, 404, 502)
  handover(
    @Param("token") token: string,
    @Body({ schema: FlowHandoverRequest }) body: FlowHandoverRequest,
  ): Promise<FlowHandoverResponse> {
    return this.calls.flowHandover(token, body);
  }

  @Post("missed")
  @HttpCode(200)
  @ApiOperation({ summary: "No agent answered", description: "The ticket stays open for a callback." })
  @ApiOkResponse({ standardSchema: FlowAckResponse })
  @ApiErrors(401, 404)
  async missed(@Param("token") token: string): Promise<FlowAckResponse> {
    await this.calls.flowMissed(token);
    return { ok: true };
  }

  @Post("ended")
  @HttpCode(200)
  @ApiOperation({ summary: "The call ended" })
  @ApiOkResponse({ standardSchema: FlowAckResponse })
  @ApiErrors(401, 404)
  async ended(@Param("token") token: string): Promise<FlowAckResponse> {
    await this.calls.flowEnded(token);
    return { ok: true };
  }
}

/**
 * Voice Gateway's registration webhook: decides whether a softphone may register. Answers in
 * jambonz's format, `{ status: "ok" | "fail" }`, always with HTTP 200.
 */
@ApiExcludeController()
@Public()
@Controller("voice/sip")
export class SipRegistrationController {
  private readonly logger = new Logger(SipRegistrationController.name);

  constructor(
    private readonly presence: PresenceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post("register")
  @HttpCode(200)
  async register(@Req() request: RawBodyRequest<Request>): Promise<{ status: "ok" | "fail"; msg?: string; expires?: number }> {
    const secret = this.config.VOICE_GATEWAY_WEBHOOK_SECRET;
    if (secret && !gatewaySignatureMatches(request.get("jambonz-signature"), request.rawBody ?? "", secret)) {
      this.logger.warn("softphone registration refused: bad signature");
      return { status: "fail", msg: "Invalid signature" };
    }

    const body = (request.body ?? {}) as Partial<DigestChallengeResponse> & { expires?: number };
    const username = (body.username ?? "").split("@")[0] ?? "";
    const owner = username ? await this.presence.owner(username) : null;
    const complete = body.realm && body.nonce && body.uri && body.response;
    if (!owner || !complete || !digestMatches({ ...(body as DigestChallengeResponse), username: body.username! }, owner.password)) {
      this.logger.warn({ username }, "softphone registration refused");
      return { status: "fail", msg: "Invalid credentials" };
    }
    return { status: "ok", expires: Math.min(Number(body.expires) || 3600, 3600) };
  }
}

/** Live calls, answering, and availability, for agents in the workspace. */
@ApiTags("Voice")
@ApiSession()
@Controller("voice")
export class VoiceController {
  constructor(
    private readonly calls: VoiceCallsService,
    private readonly presence: PresenceService,
    private readonly events: VoiceEventsService,
  ) {}

  @Get("calls")
  @ApiOperation({ summary: "List live calls", description: "Calls with the AI agent, waiting for an agent, or with an agent." })
  @ApiOkResponse({ standardSchema: LiveCallsResponse })
  live(@CurrentUser() user: SessionUser): Promise<LiveCallsResponse> {
    return this.calls.live(user);
  }

  @Post("calls/:id/answer")
  @HttpCode(200)
  @ApiOperation({
    summary: "Answer a call",
    description: "The first agent to answer takes the call and its ticket is assigned to them. 409 if another agent took it.",
  })
  @ApiOkResponse({ standardSchema: LiveCall })
  @ApiErrors(404, 409)
  answer(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<LiveCall> {
    return this.calls.answer(user, id);
  }

  @Post("calls/:id/end")
  @HttpCode(204)
  @ApiOperation({ summary: "Mark a call ended", description: "Sent by the agent's softphone when the call ends." })
  @ApiErrors(404)
  async end(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<void> {
    await this.calls.end(user, id);
  }

  @Get("presence")
  @ApiOperation({ summary: "Your availability and softphone credentials" })
  @ApiOkResponse({ standardSchema: PresenceResponse })
  getPresence(@CurrentUser() user: SessionUser): Promise<PresenceResponse> {
    return this.presence.get(user);
  }

  @Put("presence")
  @ApiOperation({
    summary: "Set your availability",
    description: "Available agents are rung when the AI agent hands a call over. Sent again every 30 seconds to stay present.",
  })
  @ApiOkResponse({ standardSchema: PresenceResponse })
  setPresence(
    @CurrentUser() user: SessionUser,
    @Body({ schema: SetPresenceRequest }) body: SetPresenceRequest,
  ): Promise<PresenceResponse> {
    return this.presence.set(user, body.status);
  }

  @Sse("events")
  @ApiOperation({ summary: "Live voice events", description: "Server-Sent Events: `calls.changed` when a call starts, changes, or ends." })
  stream(@CurrentUser() user: SessionUser): Observable<MessageEvent> {
    return this.events.stream(user.tenantId);
  }
}
