import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";

/** The Cognigy Flow authenticates with the shared VOICE_FLOW_SECRET as a bearer token. */
@Injectable()
export class FlowSecretGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.VOICE_FLOW_SECRET;
    if (!secret) throw new ServiceUnavailableException("Voice calls aren't set up: VOICE_FLOW_SECRET is missing");
    const header = context.switchToHttp().getRequest<Request>().get("authorization") ?? "";
    const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
    return true;
  }
}
