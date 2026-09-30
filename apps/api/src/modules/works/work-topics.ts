import { Injectable } from "@nestjs/common";
import type { SubjectStatus, WorkTopicsInput, WorkTopicView } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, revisionNotConfirmed } from "../../platform/http/errors";

/** The subject of a work or request and its topics, resolved for the session teacher. */
export interface ResolvedWorkTopics {
  subject: { id: string; name: string; status: SubjectStatus };
  /** Null when the work has no topic. */
  revision: { id: string; languageId: string | null; languageName: string | null } | null;
  /** In selection order. */
  topics: WorkTopicView[];
}

/**
 * The scoped query of a work's topics (011 research W11): the subject is the teacher's, and every
 * item belongs to the given revision of a document of that subject. Anything missing — nonexistent,
 * another revision, another subject, another teacher — is `404`, with nothing revealed; a revision
 * still in draft is `422 REVISION_NOT_CONFIRMED`. Whether an archived subject may be used is the
 * caller's rule (the AI request refuses it, a manual work doesn't).
 */
@Injectable()
export class WorkTopics {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(teacherId: string, subjectId: string, topics: WorkTopicsInput, tx?: Tx): Promise<ResolvedWorkTopics> {
    const db = tx ?? this.prisma;
    const subject = await db.subject.findFirst({ where: { id: subjectId, teacherId }, select: { id: true, name: true, status: true } });
    if (!subject) throw notFound();
    if (topics === null) return { subject, revision: null, topics: [] };

    const items = await db.syllabusItem.findMany({
      where: {
        id: { in: topics.syllabusItemIds },
        revisionId: topics.syllabusRevisionId,
        revision: { document: { subjectId, subject: { teacherId } } },
      },
      select: {
        id: true,
        text: true,
        group: { select: { title: true } },
        revision: { select: { id: true, status: true, languageId: true, language: { select: { name: true } } } },
      },
    });
    if (items.length !== new Set(topics.syllabusItemIds).size) throw notFound();
    const revision = items[0]!.revision;
    if (revision.status !== "CONFIRMED") throw revisionNotConfirmed();

    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      subject,
      revision: { id: revision.id, languageId: revision.languageId, languageName: revision.language?.name ?? null },
      topics: topics.syllabusItemIds.map((id) => {
        const item = byId.get(id)!;
        return { syllabusItemId: item.id, itemText: item.text, groupTitle: item.group.title };
      }),
    };
  }
}
