import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { APP_CONFIG, type AppConfig } from "./config/config.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
const config = app.get<AppConfig>(APP_CONFIG);

app.use(cookieParser());
app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
app.enableShutdownHooks();

await app.listen(config.API_PORT);
console.log(`api listening on http://localhost:${config.API_PORT}`);
