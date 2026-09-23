import { validationError } from "../http/errors";

/** Position of the last item of a page ordered by `created_at DESC, id DESC`. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

/** Opaque keyset cursor: base64url of `{createdAt, id}` of the last item of the page. */
export function encodeCursor(row: Cursor): string {
  return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), i: row.id })).toString("base64url");
}

/** Throws `400 VALIDATION_ERROR` for anything `encodeCursor` did not produce. */
export function decodeCursor(cursor: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    const createdAt = new Date(String(parsed.c));
    if (typeof parsed.i !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.i) || Number.isNaN(createdAt.getTime())) {
      throw new Error("bad cursor");
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw validationError();
  }
}

/** Rows strictly after `after` in `created_at DESC, id DESC` order (a Prisma `where` fragment). */
export const afterCursor = (after: Cursor) => ({
  OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
});

/** Escapes LIKE wildcards so a search for "100%" means the literal text. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
