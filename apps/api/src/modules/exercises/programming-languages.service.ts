import { Injectable } from "@nestjs/common";
import type { ProgrammingLanguageList } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";

/** The programming-language catalog (010 research X17): data seeded by migration, read-only here. */
@Injectable()
export class ProgrammingLanguagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active entries, ordered by name. */
  list(): Promise<ProgrammingLanguageList> {
    return this.prisma.programmingLanguage.findMany({
      where: { active: true },
      select: { id: true, key: true, name: true, highlight: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    })
    // 019: `execution` comes from `programming_languages.execution` once its migration lands (T006–T007).
    .then((rows) => rows.map((row) => ({ ...row, execution: null })));
  }
}
