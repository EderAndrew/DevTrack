import { Injectable } from "@nestjs/common";
import {
  centsToGrade,
  type CreateWorkRequest,
  gradeToCents,
  type ProgrammingLanguageList,
  type UpdateWorkRequest,
  type WorkQuestionType,
  type WorkStudentView,
  WorkQuestionTypeSchema,
  type WorkTeacherView,
  type WorkVersionRequest,
} from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import {
  notFound,
  validationError,
  workVersionConflict,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import {
  answerKeysComplete,
  workQuestionViolations,
  workWarnings,
} from "./rules/work-rules";
import type {
  AnyWorkQuestionInput,
  WorkQuestionRecord,
  WorkRecord,
} from "./types";
import { toWorkStudentView } from "./views/student-view";
import { toWorkTeacherView } from "./views/teacher-view";
import { clearWorkContent, writeWorkContent } from "./work-content";
import { isEmptyEdit, workEditDiff } from "./work-edit";
import { WORK_RECORD_SELECT, toWorkRecord } from "./work-query";
import { WorkReview } from "./work-review";
import { WorkTopics } from "./work-topics";
import { WorkStateMachine } from "./work.state-machine";

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
    private readonly review: WorkReview,
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
      await writeWorkContent(tx, {
        workId: id,
        revisionId: resolved.revision?.id ?? null,
        topicItemIds: resolved.topics.map((topic) => topic.syllabusItemId),
        totalCents,
        questions: body.questions,
      });

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
   * The whole work again (011 US5, research W16), under its row lock and at the version the
   * teacher read: kept questions by `id` (same type), new ones without, the rest removed; topics,
   * positions and values rewritten (FR-012). DRAFT and APPROVED stay as they are, with the rules
   * checked again (US5-7); ARCHIVED → 409. A generated work records the person's edit (FR-017) and
   * never loses its topics or difficulty. Nothing changed → the work as it is, no event.
   */
  async update(
    auth: AuthContext,
    workId: string,
    body: UpdateWorkRequest,
    requestId: string | null,
  ): Promise<WorkTeacherView> {
    if (
      body.questions.some(
        (question) => workQuestionViolations(question).length > 0,
      )
    )
      throw validationError();

    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(
        tx,
        auth.userId,
        workId,
        body.version,
      );
      WorkStateMachine.assertEditable(current.status);
      if (
        current.origin === "AI_GENERATED" &&
        (body.topics === null || !body.difficulty)
      )
        throw validationError();

      const stored = new Map(
        current.questions.map((question) => [question.id, question]),
      );
      for (const question of body.questions) {
        if (question.id === undefined) continue;
        const existing = stored.get(question.id);
        if (!existing) throw notFound();
        if (existing.type !== question.type) throw validationError();
      }
      const resolved = await this.workTopics.resolve(
        auth.userId,
        current.subject.id,
        body.topics,
        tx,
      );
      await this.checkLanguages(tx, body.questions, stored);

      const diff = workEditDiff(current, body);
      if (isEmptyEdit(diff)) return toWorkTeacherView(current);

      const keptIds = body.questions.flatMap((question) =>
        question.id === undefined ? [] : [question.id],
      );
      await clearWorkContent(tx, workId, keptIds);
      const totalCents = gradeToCents(body.totalGrade);
      await tx.work.update({
        where: { id: workId },
        data: {
          syllabusRevisionId: resolved.revision?.id ?? null,
          title: body.title,
          titleSearchKey: searchKey(body.title),
          description: body.description ?? null,
          difficulty: body.difficulty ?? null,
          totalGrade: centsToGrade(totalCents),
          questionCount: body.questions.length,
          version: { increment: 1 },
          ...(current.origin === "AI_GENERATED" ? { humanEdited: true } : {}),
        },
      });
      await writeWorkContent(tx, {
        workId,
        revisionId: resolved.revision?.id ?? null,
        topicItemIds: resolved.topics.map((topic) => topic.syllabusItemId),
        totalCents,
        questions: body.questions,
      });

      await this.audit.record(tx, {
        type: "work.edited",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "WORK",
        targetId: workId,
        requestId,
        metadata: { origin: current.origin, status: current.status, ...diff },
      });
      return this.getForTeacher(auth.userId, workId, tx);
    });
  }

  /**
   * DRAFT → APPROVED by a person (011 US5, FR-014, FR-015, FR-017): every answer key complete, the
   * reviewer and the date recorded, audited with the warnings the confirmation showed. Already
   * APPROVED → the work as it is, no event; ARCHIVED → 409 (a restore, never an approval). A
   * generated work's proposal closes in the same transaction (`WorkReview`).
   */
  async approve(
    auth: AuthContext,
    workId: string,
    body: WorkVersionRequest,
    requestId: string | null,
  ): Promise<WorkTeacherView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(
        tx,
        auth.userId,
        workId,
        body.version,
      );
      WorkStateMachine.assertEditable(current.status);
      if (!WorkStateMachine.transition(current.status, "APPROVED"))
        return toWorkTeacherView(current);
      if (!answerKeysComplete(current.questions)) throw validationError();

      const now = new Date();
      await tx.work.update({
        where: { id: workId },
        data: {
          status: "APPROVED",
          humanReviewed: true,
          reviewedById: auth.userId,
          reviewedAt: now,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
        type: "work.approved",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "WORK",
        targetId: workId,
        requestId,
        metadata: {
          origin: current.origin,
          humanEdited: current.humanEdited,
          generationRequestId: current.generationRequestId,
          warnings: workWarnings(current.questions).map(
            (warning) => warning.code,
          ),
        },
      });
      if (current.generationRequestId) {
        await this.review.changed(tx, {
          auth,
          workId,
          generationRequestId: current.generationRequestId,
          requestId,
          now,
        });
      }
      return this.getForTeacher(auth.userId, workId, tx);
    });
  }

  /**
   * The teacher's work under its row lock (research W16): another teacher's or a missing one is
   * 404; a version other than the one stored → `409 WORK_VERSION_CONFLICT`, so of two tabs only
   * the first change counts.
   */
  private async lockedRecord(
    tx: Tx,
    teacherId: string,
    workId: string,
    version: number,
  ): Promise<WorkRecord> {
    const locked = await tx.$queryRaw<{ version: number }[]>`
      SELECT version FROM works WHERE id = ${workId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    if (locked[0]!.version !== version) throw workVersionConflict();
    return this.ownRecord(teacherId, workId, tx);
  }

  /**
   * Every language of a code question is an active entry of the catalog (FR-007); nothing about
   * languages is fixed in code. Unknown or inactive → 400.
   */
  private async checkLanguages(
    tx: Tx,
    questions: readonly AnyWorkQuestionInput[],
    stored: ReadonlyMap<string, WorkQuestionRecord> = new Map(),
  ): Promise<void> {
    // A kept question keeps its language even if it was deactivated since (FR-007).
    const unchanged = (question: AnyWorkQuestionInput & { type: "CODE" }) =>
      question.id !== undefined &&
      stored.get(question.id)?.language?.id === question.languageId;
    const languageIds = [
      ...new Set(
        questions.flatMap((question) =>
          question.type === "CODE" && !unchanged(question)
            ? [question.languageId]
            : [],
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
