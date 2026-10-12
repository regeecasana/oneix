import { applyDecorators } from "@nestjs/common";
import { ApiCookieAuth, ApiResponse } from "@nestjs/swagger";
import { ApiError } from "@oneix/contracts";

/** Name of the session cookie security scheme in the OpenAPI document. */
export const SESSION_AUTH = "session";

const errorDescriptions: Record<number, string> = {
  400: "The request is invalid. `issues` lists each problem.",
  401: "Not signed in, or the session has expired.",
  403: "Signed in, but not allowed to do this.",
  404: "Not found, or outside what the agent may see.",
  409: "The ticket can't be changed in its current state.",
  502: "The ticket service failed. Try again.",
  503: "The ticket service is busy or not connected for this workspace.",
};

/** Documents the error responses an endpoint can return, all in the `ApiError` shape. */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: errorDescriptions[status] ?? "Error", standardSchema: ApiError }),
    ),
  );
}

/** An endpoint that needs a signed-in agent: the session cookie, and the errors that come with it. */
export function ApiSession(...extraErrors: number[]) {
  return applyDecorators(ApiCookieAuth(SESSION_AUTH), ApiErrors(401, ...extraErrors));
}
