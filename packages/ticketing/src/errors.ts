/**
 * Raised for any failure talking to the ticketing backend.
 * The message is safe to log but is not shown to clients, so the backend's name never reaches the UI.
 */
export class TicketingError extends Error {
  constructor(
    message: string,
    /** HTTP status from the backend, or 0 for network failures. */
    readonly status: number,
    /** True when the same request may succeed later (rate limit, outage, network). */
    readonly retryable: boolean,
    /** Milliseconds the backend asked us to wait, when it said. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "TicketingError";
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}
