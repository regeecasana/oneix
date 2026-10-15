import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request protection for cookie sessions. A request that changes something must come
 * from the workspace or the API's own pages (the docs); browsers send an Origin header on such
 * requests, so a form or script on another site is refused. Requests without an Origin, such as
 * server-to-server calls, and paths that don't use the session cookie are not affected: webhooks
 * (signed), the website call widget (public), and Voice Gateway and the Cognigy Flow (their own secrets).
 */
const COOKIELESS_PATHS = ["/webhooks/", "/widget/", "/voice/flow/", "/voice/sip/"];

export function sameOriginOnly(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((origin) => origin.replace(/\/$/, "")));
  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get("origin");
    if (SAFE_METHODS.has(request.method) || !origin || COOKIELESS_PATHS.some((p) => request.path.startsWith(p))) {
      return next();
    }

    const self = `${request.protocol}://${request.get("host")}`;
    if (allowed.has(origin) || origin === self) return next();

    response.status(403).json({ statusCode: 403, message: "Cross-site request refused" });
  };
}
