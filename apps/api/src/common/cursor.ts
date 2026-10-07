import { BadRequestException } from "@nestjs/common";

/** Keyset position in a list ordered by (updatedAt desc, id desc). */
export interface ListCursor {
  updatedAt: Date;
  id: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify({ u: cursor.updatedAt.toISOString(), id: cursor.id })).toString("base64url");
}

export function decodeCursor(value: string): ListCursor {
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { u?: unknown; id?: unknown };
    const updatedAt = new Date(String(raw.u));
    if (typeof raw.id !== "string" || Number.isNaN(updatedAt.getTime())) throw new Error();
    return { updatedAt, id: raw.id };
  } catch {
    throw new BadRequestException({ statusCode: 400, message: "Invalid cursor" });
  }
}
