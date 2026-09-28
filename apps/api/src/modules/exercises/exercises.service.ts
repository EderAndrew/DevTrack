import { Injectable } from "@nestjs/common";
import type { CreateExerciseRequest, ExerciseInput, ExerciseOrigin, ExerciseStatus, ExerciseTeacherView, ManualExerciseStatus, UpdateExerciseRequest } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import {
  exerciseVersionConflict,
  invalidStateTransition,
  notFound,
  revisionNotConfirmed,
  validationError,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ExerciseBatchReview } from "./batch-review";
import { ExerciseStateMachine } from "./exercise.state-machine";
import { EXERCISE_RECORD_SELECT, toExerciseRecord } from "./exercise-query";
import { type ExerciseContentRows, exerciseContentRows, exerciseViolations } from "./rules/exercise-rules";
import { toTeacherView } from "./views/teacher-view";

/**
 * The teacher's private exercise bank (010 US1, US5). The teacher always comes from the session;
 * every lookup is scoped by `teacher_id`, so another teacher's exercise or topic is a plain 404.
 * Nothing here touches the AI modules (research X1, FR-024).
 */
@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly batchReview: ExerciseBatchReview,
  ) {}

  async get(teacherId: string, exerciseId: string, db: Tx = this.prisma): Promise<ExerciseTeacherView> {
    const row = await db.exercise.findFirst({ where: { id: exerciseId, teacherId }, select: EXERCISE_RECORD_SELECT });
    if (!row) throw notFound();
    return toTeacherView(toExerciseRecord(row));
  }

  /** A manual set of 3–10 (the contract checks the size): all or nothing (010/FR-016). */
  createSet(auth: AuthContext, inputs: ExerciseInput[], status: ManualExerciseStatus, requestId: string | null): Promise<ExerciseTeacherView[]> {
    return this.createManual(auth, inputs, status, requestId);
  }

  /** A single manual exercise, without the minimum of a set (010/US5-6). */
  async createOne(auth: AuthContext, input: CreateExerciseRequest, requestId: string | null): Promise<ExerciseTeacherView> {
    const [created] = await this.createManual(auth, [input], input.status, requestId);
    return created!;
  }

  /**
   * Replaces the content of an exercise not ARCHIVED (010 US4, FR-015): the type's rules again, the
   * same type, and, for an AI exercise, the same topic and language (FR-031, FR-040). The version
   * read is checked under the row lock (research X14). An AI exercise changed by the teacher is
   * marked `humanEdited` and keeps its origin; an identical save changes nothing.
   */
  async update(auth: AuthContext, exerciseId: string, body: UpdateExerciseRequest, requestId: string | null): Promise<ExerciseTeacherView> {
    const { version, ...input } = body;
    if (exerciseViolations(input).length > 0) throw validationError();

    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockCurrent(tx, auth.userId, exerciseId, version);
      if (!ExerciseStateMachine.isEditable(current.status)) throw invalidStateTransition();
      if (input.type !== current.type) throw validationError();
      const ai = current.origin === "AI_GENERATED";
      const syllabusItemId = ai ? current.syllabusItemId : (input.syllabusItemId ?? null);
      if (ai && (input.syllabusItemId ?? current.syllabusItemId) !== current.syllabusItemId) throw validationError();
      if (ai && input.type === "CODE" && input.languageId !== current.languageId) throw validationError();
      if (syllabusItemId !== current.syllabusItemId) await this.checkTopics(tx, auth.userId, [input]);
      // A language deactivated since the exercise was saved stays valid on it.
      if (input.type === "CODE" && input.languageId !== current.languageId) await this.checkLanguages(tx, [input]);

      const rows = exerciseContentRows(input);
      const fields = changedFields(current, rows, input, syllabusItemId);
      if (fields.length === 0) return this.get(auth.userId, exerciseId, tx);

      await tx.exercise.update({
        where: { id: exerciseId },
        data: {
          statement: rows.statement,
          statementSearchKey: rows.statementSearchKey,
          explanation: rows.explanation,
          difficulty: input.difficulty,
          cognitiveObjective: input.cognitiveObjective,
          ...rows.columns,
          syllabusItemId,
          humanEdited: ai || current.humanEdited,
          version: { increment: 1 },
          // The deferred trigger checks the new alternatives at commit.
          ...(fields.includes("alternatives") ? { alternatives: { deleteMany: {}, create: rows.alternatives } } : {}),
        },
      });
      await this.audit.record(tx, {
        type: "exercise.edited",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXERCISE",
        targetId: exerciseId,
        requestId,
        metadata: { origin: current.origin, status: current.status, fields },
      });
      return this.get(auth.userId, exerciseId, tx);
    });
  }

  /**
   * DRAFT → APPROVED by the teacher (010 US4-1, FR-012, FR-013): reviewer and date recorded, the
   * batch counts it, and its review may close the AI proposal. Already APPROVED → as it is, no event.
   */
  async approve(auth: AuthContext, exerciseId: string, version: number, requestId: string | null): Promise<ExerciseTeacherView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockCurrent(tx, auth.userId, exerciseId, version);
      const now = new Date();
      if (await this.approveLocked(tx, auth, current, requestId, now)) await this.batchChanged(tx, auth, current.generationBatchId, requestId, now);
      return this.get(auth.userId, exerciseId, tx);
    });
  }

  /**
   * Several DRAFTs of one batch at once (010/FR-014). Every id must be an exercise of the teacher's
   * batch (else 404, nothing approved); the rows are locked in id order, like single approvals.
   */
  async approveMany(auth: AuthContext, batchId: string, exerciseIds: string[], requestId: string | null): Promise<ExerciseTeacherView[]> {
    const ids = [...new Set(exerciseIds)];
    return this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedExercise[]>`
        SELECT ${LOCKED_COLUMNS} FROM exercises
        WHERE id = ANY(${ids}::uuid[]) AND teacher_id = ${auth.userId}::uuid AND generation_batch_id = ${batchId}::uuid
        ORDER BY id
        FOR UPDATE`;
      if (rows.length !== ids.length) throw notFound();
      const now = new Date();
      let changed = false;
      for (const row of rows) changed = (await this.approveLocked(tx, auth, row, requestId, now)) || changed;
      if (changed) await this.batchChanged(tx, auth, batchId, requestId, now);
      return Promise.all(exerciseIds.map((id) => this.get(auth.userId, id, tx)));
    });
  }

  /**
   * Deletes a DRAFT of a batch (010 US4-3, FR-014): it was never in the bank, so it goes away with
   * its alternatives and the batch counts it as discarded. Anything else → 409.
   */
  async deleteDraft(auth: AuthContext, exerciseId: string, version: number, requestId: string | null): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockCurrent(tx, auth.userId, exerciseId, version);
      const batchId = current.generationBatchId;
      if (current.status !== "DRAFT" || batchId === null) throw invalidStateTransition();
      await tx.exercise.delete({ where: { id: exerciseId } });
      await tx.exerciseGenerationBatch.update({ where: { id: batchId }, data: { discardedCount: { increment: 1 } } });
      await this.audit.record(tx, {
        type: "exercise.discarded",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "EXERCISE_BATCH",
        targetId: batchId,
        requestId,
        metadata: { exerciseId, batchId },
      });
      await this.batchChanged(tx, auth, batchId, requestId, new Date());
    });
  }

  /** The teacher's exercise, locked; 404 when it isn't theirs, 409 when `version` is stale. */
  private async lockCurrent(tx: Tx, teacherId: string, exerciseId: string, version: number): Promise<LockedExercise> {
    const [row] = await tx.$queryRaw<LockedExercise[]>`
      SELECT ${LOCKED_COLUMNS} FROM exercises WHERE id = ${exerciseId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (!row) throw notFound();
    if (row.version !== version) throw exerciseVersionConflict();
    return row;
  }

  /** Approves a locked exercise; `false` when it already was (no event). ARCHIVED → 409. */
  private async approveLocked(tx: Tx, auth: AuthContext, row: LockedExercise, requestId: string | null, now: Date): Promise<boolean> {
    if (!ExerciseStateMachine.transition(row.status, "APPROVED", row.archivedFromStatus)) return false;
    await tx.exercise.update({
      where: { id: row.id },
      data: { status: "APPROVED", humanReviewed: true, reviewedById: auth.userId, reviewedAt: now, version: { increment: 1 } },
    });
    if (row.generationBatchId) {
      await tx.exerciseGenerationBatch.update({ where: { id: row.generationBatchId }, data: { approvedCount: { increment: 1 } } });
    }
    await this.audit.record(tx, {
      type: "exercise.approved",
      actorType: "USER",
      actorUserId: auth.userId,
      targetType: "EXERCISE",
      targetId: row.id,
      requestId,
      metadata: { origin: row.origin, humanEdited: row.humanEdited, batchId: row.generationBatchId },
    });
    return true;
  }

  private async batchChanged(tx: Tx, auth: AuthContext, batchId: string | null, requestId: string | null, now: Date): Promise<void> {
    if (batchId) await this.batchReview.changed(tx, { auth, batchId, requestId, now });
  }

  /**
   * Writes MANUAL exercises in one transaction, after the checks the contract can't do: the
   * type's rules again (FR-006), the topics (a confirmed revision of the teacher's, research X9)
   * and the languages (active entries of the catalog, FR-005). One `exercise.created` per exercise.
   */
  private async createManual(
    auth: AuthContext,
    inputs: ExerciseInput[],
    status: ManualExerciseStatus,
    requestId: string | null,
  ): Promise<ExerciseTeacherView[]> {
    if (inputs.some((input) => exerciseViolations(input).length > 0)) throw validationError();

    return this.prisma.runInTransaction(async (tx) => {
      await this.checkTopics(tx, auth.userId, inputs);
      await this.checkLanguages(tx, inputs);

      const ids: string[] = [];
      for (const input of inputs) {
        const rows = exerciseContentRows(input);
        const { id } = await tx.exercise.create({
          data: {
            teacherId: auth.userId,
            type: input.type,
            difficulty: input.difficulty,
            cognitiveObjective: input.cognitiveObjective,
            origin: "MANUAL",
            status,
            statement: rows.statement,
            statementSearchKey: rows.statementSearchKey,
            explanation: rows.explanation,
            ...rows.columns,
            syllabusItemId: input.syllabusItemId ?? null,
            // The deferred trigger checks 3–5 alternatives and one correct at commit.
            alternatives: { create: rows.alternatives },
          },
          select: { id: true },
        });
        await this.audit.record(tx, {
          type: "exercise.created",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "EXERCISE",
          targetId: id,
          requestId,
          metadata: {
            type: input.type,
            difficulty: input.difficulty,
            status,
            setSize: inputs.length,
            syllabusItemId: input.syllabusItemId ?? null,
          },
        });
        ids.push(id);
      }
      return Promise.all(ids.map((id) => this.get(auth.userId, id, tx)));
    });
  }

  /**
   * Each topic is an item of the teacher's own syllabus (else 404, whether it exists or not) in a
   * confirmed revision (else `422 REVISION_NOT_CONFIRMED`).
   */
  private async checkTopics(tx: Tx, teacherId: string, inputs: ExerciseInput[]): Promise<void> {
    const itemIds = [...new Set(inputs.flatMap((input) => (input.syllabusItemId ? [input.syllabusItemId] : [])))];
    if (itemIds.length === 0) return;
    const items = await tx.syllabusItem.findMany({
      where: { id: { in: itemIds }, revision: { document: { subject: { teacherId } } } },
      select: { revision: { select: { status: true } } },
    });
    if (items.length !== itemIds.length) throw notFound();
    if (items.some((item) => item.revision.status !== "CONFIRMED")) throw revisionNotConfirmed();
  }

  /** Every language is an active entry of the catalog; nothing about languages is fixed in code (FR-005). */
  private async checkLanguages(tx: Tx, inputs: ExerciseInput[]): Promise<void> {
    const languageIds = [...new Set(inputs.flatMap((input) => (input.type === "CODE" ? [input.languageId] : [])))];
    if (languageIds.length === 0) return;
    const active = await tx.programmingLanguage.count({ where: { id: { in: languageIds }, active: true } });
    if (active !== languageIds.length) throw validationError();
  }
}

/** What the review operations read of the locked row (snake_case columns aliased). */
interface LockedExercise {
  id: string;
  type: ExerciseInput["type"];
  origin: ExerciseOrigin;
  status: ExerciseStatus;
  archivedFromStatus: ExerciseStatus | null;
  version: number;
  statement: string;
  explanation: string;
  difficulty: ExerciseInput["difficulty"];
  cognitiveObjective: ExerciseInput["cognitiveObjective"];
  expectedAnswer: string | null;
  instructions: string | null;
  starterCode: string | null;
  expectedSolution: string | null;
  languageId: string | null;
  isTrickQuestion: boolean;
  syllabusItemId: string | null;
  generationBatchId: string | null;
  humanEdited: boolean;
  alternatives: { text: string; isCorrect: boolean }[];
}

const LOCKED_COLUMNS = Prisma.sql`
  id, type::text AS type, origin::text AS origin, status::text AS status,
  archived_from_status::text AS "archivedFromStatus", version, statement, explanation,
  difficulty::text AS difficulty, cognitive_objective::text AS "cognitiveObjective",
  expected_answer AS "expectedAnswer", instructions, starter_code AS "starterCode",
  expected_solution AS "expectedSolution", language_id AS "languageId",
  is_trick_question AS "isTrickQuestion", syllabus_item_id AS "syllabusItemId",
  generation_batch_id AS "generationBatchId", human_edited AS "humanEdited",
  COALESCE((
    SELECT json_agg(json_build_object('text', a.text, 'isCorrect', a.is_correct) ORDER BY a.position)
    FROM exercise_alternatives a WHERE a.exercise_id = exercises.id
  ), '[]'::json) AS alternatives`;

/**
 * The names of the fields an edit changes, in a fixed order (the `exercise.edited` metadata): names
 * only, never the texts (contracts/audit-events.md).
 */
function changedFields(current: LockedExercise, rows: ExerciseContentRows, input: ExerciseInput, syllabusItemId: string | null): string[] {
  const next = {
    statement: rows.statement,
    explanation: rows.explanation,
    difficulty: input.difficulty,
    cognitiveObjective: input.cognitiveObjective,
    syllabusItemId,
    expectedAnswer: rows.columns.expectedAnswer,
    instructions: rows.columns.instructions,
    starterCode: rows.columns.starterCode,
    expectedSolution: rows.columns.expectedSolution,
    languageId: rows.columns.languageId,
    alternatives: JSON.stringify(rows.alternatives.map(({ text, isCorrect }) => ({ text, isCorrect }))),
    isTrickQuestion: rows.columns.isTrickQuestion,
  };
  const before: Record<keyof typeof next, unknown> = { ...current, alternatives: JSON.stringify(current.alternatives) };
  return (Object.keys(next) as (keyof typeof next)[]).filter((field) => next[field] !== before[field]);
}
