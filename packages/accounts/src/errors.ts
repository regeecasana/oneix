export type AccountErrorCode =
  | "invalid_link"
  | "weak_password"
  | "already_member"
  | "agent_not_found"
  | "agent_already_linked"
  | "account_disabled";

/** A problem with an account action that the person can fix; the message is safe to show. */
export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}
