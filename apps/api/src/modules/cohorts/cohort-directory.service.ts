import { Injectable } from "@nestjs/common";
import type { CohortDirectoryItem, CohortDirectoryPage, CohortDirectoryQuery } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { validationError } from "../../platform/http/errors";
import { searchKey } from "../../platform/text/search-key";

export const COHORT_DIRECTORY_PAGE_SIZE = 20;

/** Only what identifies a turma and who teaches what in it (027/FR-016, constitution XXIV). */
const DIRECTORY_SELECT = {
  id: true,
  name: true,
  code: true,
  academicYear: true,
  period: true,
  classes: {
    select: { subject: { select: { name: true } }, teacher: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.CohortSelect;

type DirectoryRow = Prisma.CohortGetPayload<{ select: typeof DIRECTORY_SELECT }>;

/** Position of the last item of a page ordered by `academic_year DESC, name ASC, id ASC` (research Q10). */
interface DirectoryCursor {
  academicYear: number;
  name: string;
  id: string;
}

const encodeCursor = (row: DirectoryCursor) =>
  Buffer.from(JSON.stringify({ y: row.academicYear, n: row.name, i: row.id })).toString("base64url");

/** Throws `400 VALIDATION_ERROR` for anything `encodeCursor` did not produce. */
function decodeCursor(cursor: string): DirectoryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { y?: unknown; n?: unknown; i?: unknown };
    if (
      !Number.isInteger(parsed.y) ||
      typeof parsed.n !== "string" ||
      typeof parsed.i !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.i)
    ) {
      throw new Error("bad cursor");
    }
    return { academicYear: parsed.y as number, name: parsed.n, id: parsed.i };
  } catch {
    throw validationError();
  }
}

const afterCursor = (after: DirectoryCursor): Prisma.CohortWhereInput => ({
  OR: [
    { academicYear: { lt: after.academicYear } },
    { academicYear: after.academicYear, name: { gt: after.name } },
    { academicYear: after.academicYear, name: after.name, id: { gt: after.id } },
  ],
});

/** The item by allowlist: never students, invitations, activities or a count (FR-016). */
const toItem = (row: DirectoryRow): CohortDirectoryItem => ({
  id: row.id,
  name: row.name,
  code: row.code,
  academicYear: row.academicYear,
  period: row.period,
  classes: row.classes.map((item) => ({ subjectName: item.subject?.name ?? null, teacherName: item.teacher.name })),
});

/**
 * The teacher's search of ACTIVE turmas (027 US3, FR-016): by part of the name or the code on `search_key`
 * (no case, no accents), 20 per page by keyset. A turma belongs to no teacher, so any teacher with
 * `turmas.buscar` sees every ACTIVE one, and only the minimum.
 */
@Injectable()
export class CohortDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async search({ q, cursor }: CohortDirectoryQuery): Promise<CohortDirectoryPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const term = searchKey(q);
    const rows = await this.prisma.cohort.findMany({
      where: {
        status: "ACTIVE",
        searchKey: { contains: escapeLike(term) },
        ...(after ? { AND: [afterCursor(after)] } : {}),
      },
      select: DIRECTORY_SELECT,
      orderBy: [{ academicYear: "desc" }, { name: "asc" }, { id: "asc" }],
      take: COHORT_DIRECTORY_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, COHORT_DIRECTORY_PAGE_SIZE);
    return {
      items: page.map(toItem),
      nextCursor: rows.length > COHORT_DIRECTORY_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }
}
