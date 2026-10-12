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
    /**
     * The backend's own explanation of a rejected request, for example "Email is already being used".
     * Safe to show when acting on the backend directly, such as creating an agent.
     */
    readonly reasons: string[] = [],
  ) {
    super(message);
    this.name = "TicketingError";
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}
