const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls the oneix API with the session cookie. Throws ApiError with the server's message on failure. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
}
