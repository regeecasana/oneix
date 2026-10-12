import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  AddCommentRequest,
  ChannelCountsQuery,
  ChannelCountsResponse,
  ListTicketsQuery,
  ListTicketsResponse,
  TicketDetail,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import type { z } from "zod";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { CurrentUser, type SessionUser } from "../../common/auth.js";
import { TicketsService } from "./tickets.service.js";

const ticketId = ApiParam({ name: "id", description: "oneix ticket ID, from a ticket list." });

@ApiTags("Tickets")
@ApiSession()
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({
    summary: "List tickets",
    description:
      "One page of the inbox, from the ticket cache, limited to what the agent may see. " +
      "`status` and `priority` take comma-separated lists (`status=open,pending`, `priority=urgent,none`). " +
      "Defaults to the most recently updated first.",
  })
  @ApiOkResponse({ standardSchema: ListTicketsResponse })
  @ApiErrors(400)
  list(
    @CurrentUser() user: SessionUser,
    @Query({ schema: ListTicketsQuery }) query: z.output<typeof ListTicketsQuery>,
  ): Promise<ListTicketsResponse> {
    return this.tickets.list(user, query);
  }

  /** Declared before `:id` so it isn't read as an ID. */
  @Get("channel-counts")
  @ApiOperation({
    summary: "Count tickets per channel",
    description: "Tickets per channel under the same filters as the list, for the inbox tabs. Empty channels are left out.",
  })
  @ApiOkResponse({ standardSchema: ChannelCountsResponse })
  @ApiErrors(400)
  channelCounts(
    @CurrentUser() user: SessionUser,
    @Query({ schema: ChannelCountsQuery }) query: z.output<typeof ChannelCountsQuery>,
  ): Promise<ChannelCountsResponse> {
    return this.tickets.channelCounts(user, query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get a ticket with its thread",
    description: "Read live from the ticketing backend; the cache is refreshed on the way.",
  })
  @ticketId
  @ApiOkResponse({ standardSchema: TicketDetail })
  @ApiErrors(404, 502, 503)
  get(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<TicketDetail> {
    return this.tickets.get(user, id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Change status, priority, or assignee",
    description: "Written to the ticketing backend as the signed-in agent.",
  })
  @ticketId
  @ApiOkResponse({ standardSchema: TicketSummary })
  @ApiErrors(400, 404, 409, 502, 503)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body({ schema: UpdateTicketRequest }) body: UpdateTicketRequest,
  ): Promise<TicketSummary> {
    return this.tickets.update(user, id, body);
  }

  @Post(":id/comments")
  @ApiOperation({
    summary: "Reply or add an internal note",
    description:
      "A public reply is emailed to the customer by the backend; an internal note is for agents only. " +
      "`status` changes the status in the same update. Agents limited to internal notes get 403 for a public reply.",
  })
  @ticketId
  @ApiCreatedResponse({ description: "The ticket after the comment.", standardSchema: TicketSummary })
  @ApiErrors(400, 403, 404, 409, 502, 503)
  addComment(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body({ schema: AddCommentRequest }) body: AddCommentRequest,
  ): Promise<TicketSummary> {
    return this.tickets.addComment(user, id, body);
  }
}
