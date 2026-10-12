import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request protection for cookie sessions. A request that changes something must come
 * from the workspace or the API's own pages (the docs); browsers send an Origin header on such
 * requests, so a form or script on another site is refused. Requests without an Origin, such as
 * server-to-server calls, and the webhooks, which authenticate by signature, are not affected.
 */
export function sameOriginOnly(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((origin) => origin.replace(/\/$/, "")));
  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get("origin");
    if (SAFE_METHODS.has(request.method) || !origin || request.path.startsWith("/webhooks/")) return next();

    const self = `${request.protocol}://${request.get("host")}`;
    if (allowed.has(origin) || origin === self) return next();

    response.status(403).json({ statusCode: 403, message: "Cross-site request refused" });
  };
}
