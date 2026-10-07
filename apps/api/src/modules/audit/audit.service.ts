import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oneix/db";
import { PRISMA } from "../../common/providers.module.js";

export interface AuditEntry {
  tenantId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}
