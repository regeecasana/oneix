import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { AccountError, type AccountErrorCode } from "@oneix/accounts";
import type { Response } from "express";

const STATUS: Record<AccountErrorCode, number> = {
  invalid_link: 400,
  weak_password: 400,
  agent_not_found: 404,
  already_member: 409,
  agent_already_linked: 409,
  account_disabled: 409,
};

/** Account problems the person can fix, with a message that is safe to show. */
@Catch(AccountError)
export class AccountErrorFilter implements ExceptionFilter {
  catch(error: AccountError, host: ArgumentsHost): void {
    const status = STATUS[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message });
  }
}
