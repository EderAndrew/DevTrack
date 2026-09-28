import { Injectable } from "@nestjs/common";
import type { CreateExerciseRequest, ExerciseInput, ExerciseTeacherView, ManualExerciseStatus } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, revisionNotConfirmed, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { EXERCISE_RECORD_SELECT, toExerciseRecord } from "./exercise-query";
import { exerciseContentRows, exerciseViolations } from "./rules/exercise-rules";
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
