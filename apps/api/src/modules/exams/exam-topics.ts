import { Injectable } from "@nestjs/common";
import type { SubjectStatus, WorkTopicView } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, revisionNotConfirmed } from "../../platform/http/errors";

/** The subject of an exam and its topics, resolved for the session teacher. */
export interface ResolvedExamTopics {
  subject: { id: string; name: string; status: SubjectStatus };
  revision: { id: string; languageId: string | null };
  /** In selection order. */
  topics: WorkTopicView[];
}

/**
 * The scoped query of an exam's topics (018/FR-002, as 011 research W11): the subject is the
 * teacher's and every item belongs to the given revision of a document of that subject. Anything
 * missing — nonexistent, another revision, another subject, another teacher — is `404`, revealing
 * nothing; a revision still in draft is `422 REVISION_NOT_CONFIRMED`. An exam always has topics.
 */
@Injectable()
export class ExamTopics {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(teacherId: string, subjectId: string, revisionId: string, itemIds: readonly string[], tx?: Tx): Promise<ResolvedExamTopics> {
    const db = tx ?? this.prisma;
    const subject = await db.subject.findFirst({ where: { id: subjectId, teacherId }, select: { id: true, name: true, status: true } });
    if (!subject) throw notFound();

    const items = await db.syllabusItem.findMany({
      where: { id: { in: [...itemIds] }, revisionId, revision: { document: { subjectId, subject: { teacherId } } } },
      select: { id: true, text: true, group: { select: { title: true } }, revision: { select: { id: true, status: true, languageId: true } } },
    });
    if (items.length === 0 || items.length !== new Set(itemIds).size) throw notFound();
    const revision = items[0]!.revision;
    if (revision.status !== "CONFIRMED") throw revisionNotConfirmed();

    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      subject,
      revision: { id: revision.id, languageId: revision.languageId },
      topics: itemIds.map((id) => {
        const item = byId.get(id)!;
        return { syllabusItemId: item.id, itemText: item.text, groupTitle: item.group.title };
      }),
    };
  }
}
