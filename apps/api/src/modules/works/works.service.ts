import { Injectable } from "@nestjs/common";
import {
  centsToGrade,
  type CreateWorkRequest,
  gradeToCents,
  type ProgrammingLanguageList,
  type WorkQuestionType,
  type WorkStudentView,
  WorkQuestionTypeSchema,
  type WorkTeacherView,
} from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { withValues } from "./grade/grade-values";
import {
  workQuestionContentRows,
  workQuestionViolations,
} from "./rules/work-rules";
import type { AnyWorkQuestionInput } from "./types";
import { toWorkStudentView } from "./views/student-view";
import { toWorkTeacherView } from "./views/teacher-view";
import { WORK_RECORD_SELECT, toWorkRecord } from "./work-query";
import { WorkTopics } from "./work-topics";

/**
 * The teacher's private work bank (011 US1). The teacher always comes from the session; every
 * lookup is scoped by `teacher_id`, so another teacher's work, subject or topic is a plain 404.
 * Grades are integer hundredths here and `numeric(5,2)` strings only at the database boundary
 * (research W3). Nothing here touches the AI modules (research W1, FR-024).
 */
@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workTopics: WorkTopics,
  ) {}

  async getForTeacher(
    teacherId: string,
    workId: string,
    db: Tx = this.prisma,
  ): Promise<WorkTeacherView> {
    return toWorkTeacherView(await this.ownRecord(teacherId, workId, db));
  }

  /**
   * "Ver como aluno" (011/US6): the student view of the teacher's own work, from the allowlist
   * builder that 012 serves to students (research W14); never the teacher view with fields removed.
   */
  async studentPreview(
    teacherId: string,
    workId: string,
  ): Promise<WorkStudentView> {
    return toWorkStudentView(await this.ownRecord(teacherId, workId));
  }

  /** The work of this teacher; another teacher's or a missing one is the same 404. */
  private async ownRecord(
    teacherId: string,
    workId: string,
    db: Tx = this.prisma,
  ) {
    const row = await db.work.findFirst({
      where: { id: workId, teacherId },
      select: WORK_RECORD_SELECT,
    });
    if (!row) throw notFound();
    return toWorkRecord(row);
  }

  /** The active entries of the shared language catalog, by name (research W18); read-only. */
  programmingLanguages(): Promise<ProgrammingLanguageList> {
    return this.prisma.programmingLanguage.findMany({
      where: { active: true },
      select: { id: true, key: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  /**
   * A MANUAL work, all or nothing (011 US1, FR-002, FR-014): after the checks the contract can't
   * do — the type's rules (FR-008), the subject and topics of the teacher's (research W11), the
   * languages (active catalog entries, FR-007) — the work, its topics and its questions with the
   * values computed from the total (research W4). "Salvar e aprovar" records the reviewer and is
   * audited as an approval too (contracts/audit-events.md).
   */
  async create(
    auth: AuthContext,
    body: CreateWorkRequest,
    requestId: string | null,
  ): Promise<WorkTeacherView> {
    if (
      body.questions.some(
        (question) => workQuestionViolations(question).length > 0,
      )
    )
      throw validationError();

    return this.prisma.runInTransaction(async (tx) => {
      const resolved = await this.workTopics.resolve(
        auth.userId,
        body.subjectId,
        body.topics,
        tx,
      );
      await this.checkLanguages(tx, body.questions);

      const approved = body.status === "APPROVED";
      const totalCents = gradeToCents(body.totalGrade);
      const { id } = await tx.work.create({
        data: {
          teacherId: auth.userId,
          subjectId: resolved.subject.id,
          syllabusRevisionId: resolved.revision?.id ?? null,
          title: body.title,
          titleSearchKey: searchKey(body.title),
          description: body.description ?? null,
          difficulty: body.difficulty ?? null,
          totalGrade: centsToGrade(totalCents),
          questionCount: body.questions.length,
          origin: "MANUAL",
          status: body.status,
          humanReviewed: approved,
          ...(approved
            ? { reviewedById: auth.userId, reviewedAt: new Date() }
            : {}),
        },
        select: { id: true },
      });
      await this.writeContent(
        tx,
        id,
        resolved.revision?.id ?? null,
        resolved.topics.map((topic) => topic.syllabusItemId),
        totalCents,
        body.questions,
      );

      await this.audit.record(tx, {
        type: "work.created",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "WORK",
        targetId: id,
        requestId,
        metadata: {
          subjectId: resolved.subject.id,
          status: body.status,
          questionCount: body.questions.length,
          types: typeCounts(body.questions),
          topicCount: resolved.topics.length,
          difficulty: body.difficulty ?? null,
        },
      });
      const view = await this.getForTeacher(auth.userId, id, tx);
      if (approved) {
        await this.audit.record(tx, {
          type: "work.approved",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "WORK",
          targetId: id,
          requestId,
          metadata: {
            origin: "MANUAL",
            humanEdited: false,
            generationRequestId: null,
            warnings: view.warnings.map((warning) => warning.code),
          },
        });
      }
      return view;
    });
  }

  /**
   * The work's topics in selection order, then each question in array order (its position) with
   * its value, type columns, alternatives, test cases and topics. The deferred triggers check the
   * whole aggregate (counts, positions, the sum of the values) at commit.
   */
  private async writeContent(
    tx: Tx,
    workId: string,
    revisionId: string | null,
    topicItemIds: string[],
    totalCents: number,
    questions: readonly AnyWorkQuestionInput[],
  ): Promise<void> {
    if (revisionId !== null && topicItemIds.length > 0) {
      await tx.workTopic.createMany({
        data: topicItemIds.map((syllabusItemId, position) => ({
          workId,
          syllabusItemId,
          syllabusRevisionId: revisionId,
          position,
        })),
      });
    }
    for (const [position, question] of withValues(
      totalCents,
      questions,
    ).entries()) {
      const rows = workQuestionContentRows(question);
      await tx.workQuestion.create({
        data: {
          workId,
          position,
          type: question.type,
          gradingStrategy: rows.gradingStrategy,
          statement: rows.statement,
          statementSearchKey: rows.statementSearchKey,
          explanation: rows.explanation,
          value: centsToGrade(question.valueCents),
          ...rows.columns,
          alternatives: { create: rows.alternatives },
          testCases: { create: rows.testCases },
          topics: {
            create: (question.topicItemIds ?? []).map((syllabusItemId) => ({
              syllabusItemId,
            })),
          },
        },
      });
    }
  }

  /**
   * Every language of a code question is an active entry of the catalog (FR-007); nothing about
   * languages is fixed in code. Unknown or inactive → 400.
   */
  private async checkLanguages(
    tx: Tx,
    questions: readonly AnyWorkQuestionInput[],
  ): Promise<void> {
    const languageIds = [
      ...new Set(
        questions.flatMap((question) =>
          question.type === "CODE" ? [question.languageId] : [],
        ),
      ),
    ];
    if (languageIds.length === 0) return;
    const active = await tx.programmingLanguage.count({
      where: { id: { in: languageIds }, active: true },
    });
    if (active !== languageIds.length) throw validationError();
  }
}

/** Questions per type, every type present (the `types` metadata of `work.created`). */
function typeCounts(
  questions: readonly { type: WorkQuestionType }[],
): Record<WorkQuestionType, number> {
  return Object.fromEntries(
    WorkQuestionTypeSchema.options.map((type) => [
      type,
      questions.filter((question) => question.type === type).length,
    ]),
  ) as Record<WorkQuestionType, number>;
}
