import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface.js";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { DOCS_PATH, setupApiDocs } from "./common/openapi.js";
import { sameOriginOnly } from "./common/same-origin.js";
import { schemaValidationPipe } from "./common/validation.js";
import { APP_CONFIG, type AppConfig } from "./config/config.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
const config = app.get<AppConfig>(APP_CONFIG);

app.use(cookieParser());
app.use(sameOriginOnly([config.WEB_ORIGIN]));
app.useGlobalPipes(schemaValidationPipe());
// The workspace calls with its session cookie; client websites only call the public widget API.
app.enableCors((request: { url?: string }, callback: (error: Error | null, options: CorsOptions) => void) => {
  callback(
    null,
    request.url?.startsWith("/widget/")
      ? { origin: config.WIDGET_ORIGINS, credentials: false }
      : { origin: config.WEB_ORIGIN, credentials: true },
  );
});
app.enableShutdownHooks();

const apiDocs = config.API_DOCS ?? config.NODE_ENV !== "production";
if (apiDocs) setupApiDocs(app);

await app.listen(config.API_PORT);
console.log(`api listening on http://localhost:${config.API_PORT}`);
if (apiDocs) console.log(`api docs on http://localhost:${config.API_PORT}${DOCS_PATH}`);
