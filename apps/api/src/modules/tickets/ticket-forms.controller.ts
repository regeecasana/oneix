import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TicketFormsQuery, TicketFormsResponse } from "@oneix/contracts";
import { ApiErrors, ApiSession } from "../../common/api-docs.js";
import { CurrentUser, type SessionUser } from "../../common/auth.js";
import { TicketFormsService } from "./ticket-forms.service.js";

@ApiTags("Tickets")
@ApiSession()
@Controller("ticket-forms")
export class TicketFormsController {
  constructor(private readonly forms: TicketFormsService) {}

  @Get()
  @ApiOperation({
    summary: "List ticket forms and their custom fields",
    description:
      "The forms a ticket of the brand can use, plus its current form and the default form, with every " +
      "field they show and the conditions that show or require fields. Kept in sync with the backend hourly.",
  })
  @ApiOkResponse({ standardSchema: TicketFormsResponse })
  @ApiErrors(400)
  list(@CurrentUser() user: SessionUser, @Query({ schema: TicketFormsQuery }) query: TicketFormsQuery): Promise<TicketFormsResponse> {
    return this.forms.forBrand(user, query.brandId ?? null, query.formId);
  }
}
