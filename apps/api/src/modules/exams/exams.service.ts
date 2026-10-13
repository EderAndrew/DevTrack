import { Injectable } from "@nestjs/common";
import {
  centsToGrade,
  type CreateExamRequest,
  type ExamListQuery,
  type ExamPage,
  type ExamQuestionEdit,
  type ExamRuleViolation,
  type ExamStudentPreview,
  type ExamVersion,
  gradeToCents,
  type ProgrammingLanguageList,
  type TeacherExam,
  type UpdateExamRequest,
} from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { AppException, invalidStateTransition, notFound, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { clearExamContent, writeExamContent } from "./exam-content";
import { examEditDiff } from "./exam-edit";
import { afterUpdated, EXAM_PAGE_SIZE_DEFAULT, EXAM_RECORD_SELECT, EXAM_SUMMARY_SELECT, examListWhere, toExamRecord, toExamSummary } from "./exam-query";
import { approvalViolations, examStructureViolations, inputApprovalViolations } from "./exam-rules";
import { ExamTopics } from "./exam-topics";
import { ExamStateMachine } from "./exam.state-machine";
import type { ExamQuestionRecord, ExamRecord } from "./types";
import { toExamStudentPreview } from "./views/student-view";
import { toTeacherExam } from "./views/teacher-view";

/** `422 EXAM_RULES` naming the questions the editor must point at (contracts/http-api.md). */
const examRules = (violations: ExamRuleViolation[]) => new AppException("EXAM_RULES", undefined, {}, { violations });

/**
 * The teacher's private Banco de Provas (018 US1, research T2). The teacher always comes from the
 * session; every lookup is scoped by `teacher_id`, so another teacher's exam, subject or topic is a
 * plain 404. Grades are integer hundredths here and `numeric(5,2)` strings only at the database
 * boundary. Nothing here touches the AI modules (FR-006).
 */
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly examTopics: ExamTopics,
  ) {}

  async getForTeacher(teacherId: string, examId: string, db: Tx = this.prisma): Promise<TeacherExam> {
    return toTeacherExam(await this.ownRecord(teacherId, examId, db));
  }

  /** The active entries of the shared language catalog, by name; read-only. */
  programmingLanguages(): Promise<ProgrammingLanguageList> {
    return this.prisma.programmingLanguage.findMany({
      where: { active: true },
      select: { id: true, key: true, name: true, highlight: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  /** "Ver como aluno": the allowlist builder, never the teacher view with fields removed (FR-029). */
  async studentPreview(teacherId: string, examId: string): Promise<ExamStudentPreview> {
    return toExamStudentPreview(await this.ownRecord(teacherId, examId));
  }

  /** The teacher's bank: every filter at once, a keyset page by `updated_at desc, id` of at most 50. */
  async list(teacherId: string, { cursor, limit = EXAM_PAGE_SIZE_DEFAULT, ...filters }: ExamListQuery): Promise<ExamPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const where = examListWhere(teacherId, filters);
    const rows = await this.prisma.exam.findMany({
      where: after ? { AND: [where, afterUpdated(after)] } : where,
      select: EXAM_SUMMARY_SELECT,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toExamSummary),
      nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
    };
  }

  /**
   * A MANUAL exam, all or nothing (FR-001–FR-004): the type's rules (422 with the positions), the
   * subject, revision and topics of the teacher's (404/422), the languages (active catalog entries,
   * 400), then the exam with the values computed from the total. "Salvar e aprovar" needs a difficulty
   * on every question and is audited as an approval too.
   */
  async create(auth: AuthContext, body: CreateExamRequest, requestId: string | null): Promise<TeacherExam> {
    const approved = body.saveAs === "APPROVED";
    const violations = [...examStructureViolations(body.questions), ...(approved ? inputApprovalViolations(body.questions) : [])];
    if (violations.length > 0) throw examRules(violations);

    return this.prisma.runInTransaction(async (tx) => {
      const resolved = await this.examTopics.resolve(auth.userId, body.subjectId, body.syllabusRevisionId, body.topicIds, tx);
      await this.checkLanguages(tx, body.questions);

      const totalCents = gradeToCents(body.totalGrade);
      const { id } = await tx.exam.create({
        data: {
          teacherId: auth.userId,
          subjectId: resolved.subject.id,
          syllabusRevisionId: resolved.revision.id,
          title: body.title,
          titleSearchKey: searchKey(body.title),
          description: body.description ?? null,
          totalGrade: centsToGrade(totalCents),
          questionCount: body.questions.length,
          origin: "MANUAL",
          status: body.saveAs,
          humanReviewed: approved,
          ...(approved ? { reviewedById: auth.userId, reviewedAt: new Date() } : {}),
        },
        select: { id: true },
      });
      await writeExamContent(tx, {
        examId: id,
        revisionId: resolved.revision.id,
        topicItemIds: resolved.topics.map((topic) => topic.syllabusItemId),
        totalCents,
        questions: body.questions,
      });

      await this.audit.record(tx, {
        type: "exam.created",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXAM",
        targetId: id,
        requestId,
        metadata: { subjectId: resolved.subject.id, origin: "MANUAL", status: body.saveAs, questionCount: body.questions.length },
      });
      if (approved) await this.recordApproval(tx, auth, id, { origin: "MANUAL", humanEdited: false }, requestId);
      return this.getForTeacher(auth.userId, id, tx);
    });
  }

  /**
   * The whole exam again, under its row lock and at the version the teacher read: kept questions by
   * `id` (same type), new ones without, the rest removed; topics, positions and values rewritten.
   * DRAFT and APPROVED keep their status, an APPROVED exam with its approval rules checked again;
   * ARCHIVED → 409. The classes keep the copy they were given (FR-007). Nothing changed → no event.
   */
  async update(auth: AuthContext, examId: string, body: UpdateExamRequest, requestId: string | null): Promise<TeacherExam> {
    const structure = examStructureViolations(body.questions);
    if (structure.length > 0) throw examRules(structure);

    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(tx, auth.userId, examId, body.version);
      ExamStateMachine.assertNotArchived(current.status);
      if (current.status === "APPROVED") {
        const approval = inputApprovalViolations(body.questions);
        if (approval.length > 0) throw examRules(approval);
      }

      const stored = new Map(current.questions.map((question) => [question.id, question]));
      for (const question of body.questions) {
        if (question.id === undefined) continue;
        const existing = stored.get(question.id);
        if (!existing) throw notFound();
        if (existing.type !== question.type) throw validationError();
      }
      const resolved = await this.examTopics.resolve(auth.userId, current.subject.id, body.syllabusRevisionId, body.topicIds, tx);
      await this.checkLanguages(tx, body.questions, stored);

      const diff = examEditDiff(current, body);
      if (diff.fields.length === 0) return toTeacherExam(current);

      const keptIds = body.questions.flatMap((question) => (question.id === undefined ? [] : [question.id]));
      await clearExamContent(tx, examId, keptIds);
      const totalCents = gradeToCents(body.totalGrade);
      await tx.exam.update({
        where: { id: examId },
        data: {
          syllabusRevisionId: resolved.revision.id,
          title: body.title,
          titleSearchKey: searchKey(body.title),
          description: body.description ?? null,
          totalGrade: centsToGrade(totalCents),
          questionCount: body.questions.length,
          version: { increment: 1 },
          ...(current.origin === "AI_GENERATED" ? { humanEdited: true } : {}),
        },
      });
      await writeExamContent(tx, {
        examId,
        revisionId: resolved.revision.id,
        topicItemIds: resolved.topics.map((topic) => topic.syllabusItemId),
        totalCents,
        questions: body.questions,
      });

      await this.audit.record(tx, {
        type: "exam.edited",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXAM",
        targetId: examId,
        requestId,
        metadata: { fields: diff.fields, questionCountChanged: diff.questionCountChanged },
      });
      return this.getForTeacher(auth.userId, examId, tx);
    });
  }

  /**
   * DRAFT → APPROVED by a person (FR-004): every question with its key, a difficulty and a topic, or
   * `422 EXAM_RULES` naming the positions. Already APPROVED → the exam as it is, no event; ARCHIVED →
   * `409 EXAM_ARCHIVED` (a restore, never an approval).
   */
  async approve(auth: AuthContext, examId: string, body: ExamVersion, requestId: string | null): Promise<TeacherExam> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(tx, auth.userId, examId, body.version);
      ExamStateMachine.assertNotArchived(current.status);
      if (!ExamStateMachine.transition(current.status, "APPROVED")) return toTeacherExam(current);
      const violations = approvalViolations(current.questions);
      if (violations.length > 0) throw examRules(violations);

      await tx.exam.update({
        where: { id: examId },
        data: { status: "APPROVED", humanReviewed: true, reviewedById: auth.userId, reviewedAt: new Date(), version: { increment: 1 } },
      });
      await this.recordApproval(tx, auth, examId, { origin: current.origin, humanEdited: current.humanEdited }, requestId);
      return this.getForTeacher(auth.userId, examId, tx);
    });
  }

  /** DRAFT or APPROVED → ARCHIVED, keeping the status a restore goes back to; already ARCHIVED → no event. */
  async archive(auth: AuthContext, examId: string, body: ExamVersion, requestId: string | null): Promise<TeacherExam> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(tx, auth.userId, examId, body.version);
      if (!ExamStateMachine.transition(current.status, "ARCHIVED")) return toTeacherExam(current);
      await tx.exam.update({ where: { id: examId }, data: { status: "ARCHIVED", archivedFromStatus: current.status, version: { increment: 1 } } });
      await this.audit.record(tx, {
        type: "exam.archived",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXAM",
        targetId: examId,
        requestId,
        metadata: { fromStatus: current.status },
      });
      return this.getForTeacher(auth.userId, examId, tx);
    });
  }

  /** ARCHIVED → the status it had before; anything not archived → 409. */
  async restore(auth: AuthContext, examId: string, body: ExamVersion, requestId: string | null): Promise<TeacherExam> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockedRecord(tx, auth.userId, examId, body.version);
      if (current.status !== "ARCHIVED") throw invalidStateTransition();
      const to = ExamStateMachine.restoredStatus(current.archivedFromStatus);
      ExamStateMachine.transition(current.status, to, current.archivedFromStatus);
      await tx.exam.update({ where: { id: examId }, data: { status: to, archivedFromStatus: null, version: { increment: 1 } } });
      await this.audit.record(tx, {
        type: "exam.restored",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXAM",
        targetId: examId,
        requestId,
        metadata: { fromStatus: current.status },
      });
      return this.getForTeacher(auth.userId, examId, tx);
    });
  }

  private recordApproval(tx: Tx, auth: AuthContext, examId: string, metadata: { origin: string; humanEdited: boolean }, requestId: string | null) {
    return this.audit.record(tx, {
      type: "exam.approved",
      actorType: "USER",
      actorUserId: auth.userId,
      targetType: "EXAM",
      targetId: examId,
      requestId,
      metadata,
    });
  }

  /** The exam of this teacher; another teacher's or a missing one is the same 404. */
  private async ownRecord(teacherId: string, examId: string, db: Tx = this.prisma): Promise<ExamRecord> {
    const row = await db.exam.findFirst({ where: { id: examId, teacherId }, select: EXAM_RECORD_SELECT });
    if (!row) throw notFound();
    return toExamRecord(row);
  }

  /**
   * The teacher's exam under its row lock: another teacher's or a missing one is 404; a version
   * other than the one stored → `409 EXAM_VERSION_CONFLICT`, so of two tabs only the first counts.
   */
  private async lockedRecord(tx: Tx, teacherId: string, examId: string, version: number): Promise<ExamRecord> {
    const locked = await tx.$queryRaw<{ version: number }[]>`
      SELECT version FROM exams WHERE id = ${examId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    if (locked[0]!.version !== version) throw new AppException("EXAM_VERSION_CONFLICT");
    return this.ownRecord(teacherId, examId, tx);
  }

  /** Every language of a code question is an active catalog entry; a kept question keeps its own. Else 400. */
  private async checkLanguages(
    tx: Tx,
    questions: readonly ExamQuestionEdit[],
    stored: ReadonlyMap<string, ExamQuestionRecord> = new Map(),
  ): Promise<void> {
    const unchanged = (question: ExamQuestionEdit & { type: "CODE" }) =>
      question.id !== undefined && stored.get(question.id)?.language?.id === question.languageId;
    const languageIds = [
      ...new Set(questions.flatMap((question) => (question.type === "CODE" && !unchanged(question) ? [question.languageId] : []))),
    ];
    if (languageIds.length === 0) return;
    const active = await tx.programmingLanguage.count({ where: { id: { in: languageIds }, active: true } });
    if (active !== languageIds.length) throw validationError();
  }
}
