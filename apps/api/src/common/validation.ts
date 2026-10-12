import { BadRequestException, StandardSchemaValidationPipe } from "@nestjs/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/** `status.0` for a path like ["status", 0]. */
function pathOf(issue: StandardSchemaV1.Issue): string {
  return (issue.path ?? [])
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

/**
 * Validates every parameter declared with a contracts schema, such as `@Body({ schema: AddCommentRequest })`,
 * and returns the parsed value (defaults and conversions applied). The same schemas document the
 * API in Swagger. Failures answer 400 with each issue's path and message.
 */
export function schemaValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new BadRequestException({
        statusCode: 400,
        message: "Validation failed",
        issues: issues.map((issue) => ({ path: pathOf(issue), message: issue.message })),
      }),
  });
}
