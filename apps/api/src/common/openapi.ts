import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";
import { SESSION_AUTH } from "./api-docs.js";
import { SESSION_COOKIE } from "./session.js";

export const OPENAPI_PATH = "/openapi.json";
export const DOCS_PATH = "/docs";

/**
 * Serves the API documentation: the OpenAPI document at /openapi.json and a Scalar API reference
 * at /docs. `@nestjs/swagger` only generates the document; its request and response schemas come
 * from @oneix/contracts, the same Zod schemas that validate requests, so the docs can't drift.
 */
export function setupApiDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("oneix API")
    .setDescription(
      [
        "The oneix orchestration API: the agent workspace's endpoints and the webhooks platforms call.",
        "",
        "**Signing in:** send `POST /auth/dev-login` (development only) from this page; the browser keeps the",
        "session cookie for the other endpoints. Every endpoint works within the signed-in agent's workspace and",
        "ticket access.",
        "",
        "**Errors** share one shape: `{ statusCode, message, issues? }`.",
      ].join("\n"),
    )
    .setVersion("0.1")
    .addCookieAuth(SESSION_COOKIE, { type: "apiKey", in: "cookie", name: SESSION_COOKIE }, SESSION_AUTH)
    .build();

  const document = SwaggerModule.createDocument(app, config);

  app.getHttpAdapter().get(OPENAPI_PATH, (_request: Request, response: Response) => {
    response.json(document);
  });

  // Served from the API's own origin, so "Send" requests carry the session cookie.
  app.use(
    DOCS_PATH,
    apiReference({
      url: OPENAPI_PATH,
      pageTitle: "oneix API",
      theme: "default",
      layout: "modern",
      persistAuth: true,
      defaultOpenAllTags: true,
      authentication: { preferredSecurityScheme: SESSION_AUTH },
    }),
  );
}
