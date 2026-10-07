import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { createLogger } from "@oneix/logger";
import { TenantNotConnectedError } from "@oneix/tenancy";
import { TicketingError } from "@oneix/ticketing";
import type { Response } from "express";

const logger = createLogger("api");

/**
 * Turns backend failures into neutral responses.
 * Details are logged; clients never see the backend's name or raw error.
 */
@Catch(TicketingError, TenantNotConnectedError)
export class TicketingErrorFilter implements ExceptionFilter {
  catch(error: TicketingError | TenantNotConnectedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof TenantNotConnectedError) {
      logger.warn({ tenantId: error.tenantId }, "tenant has no active ticketing connection");
      response
        .status(503)
        .json({ statusCode: 503, message: "This workspace isn't connected to its ticket service yet." });
      return;
    }
    logger.error({ err: error, status: error.status }, "ticketing backend error");

    if (error.status === 404) {
      response.status(404).json({ statusCode: 404, message: "Ticket not found" });
      return;
    }
    if (error.status === 422) {
      response.status(409).json({ statusCode: 409, message: "The ticket can't be changed in its current state" });
      return;
    }
    if (error.status === 429) {
      if (error.retryAfterMs) response.setHeader("Retry-After", Math.ceil(error.retryAfterMs / 1000));
      response.status(503).json({ statusCode: 503, message: "The ticket service is busy. Try again shortly." });
      return;
    }
    response.status(502).json({ statusCode: 502, message: "The ticket service is unavailable. Try again." });
  }
}
