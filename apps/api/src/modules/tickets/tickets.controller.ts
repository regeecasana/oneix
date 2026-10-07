import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  AddNoteRequest,
  ListTicketsQuery,
  type ListTicketsResponse,
  type TicketDetail,
  type TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import type { z } from "zod";
import { CurrentUser, type SessionUser } from "../../common/auth.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { TicketsService } from "./tickets.service.js";

@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(ListTicketsQuery)) query: z.output<typeof ListTicketsQuery>,
  ): Promise<ListTicketsResponse> {
    return this.tickets.list(user, query);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<TicketDetail> {
    return this.tickets.get(user, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateTicketRequest)) body: UpdateTicketRequest,
  ): Promise<TicketSummary> {
    return this.tickets.update(user, id, body);
  }

  @Post(":id/notes")
  @HttpCode(204)
  addNote(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(AddNoteRequest)) body: AddNoteRequest,
  ): Promise<void> {
    return this.tickets.addNote(user, id, body);
  }
}
