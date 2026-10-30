import { Inject, Injectable } from "@nestjs/common";
import type { AttemptCodeRunSummary } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { settleStaleRuns } from "./settle-stale";
import {
  LAST_FINISHED_SELECT,
  toTeacherRunSummary,
} from "./views/teacher-run-summary";

interface CountRow {
  question_id: string;
  run_count: number;
  pending: boolean;
  last_id: string | null;
}

/**
 * The teacher's summary of a student's runs in a work (021 US3, research Y7, Y8): per CODE question of
 * the activity, by position, the runs of the attempt (every participant's in a group, 023/FR-021, the last
 * one naming who ran it), whether one is pending and the last finished
 * run's status, counts and verdicts. Derived on every read from the facts 019 keeps without content
 * (FR-014), so it is the same after the 24 h purge; never a grade (FR-013). The student's stale runs
 * are settled first (019 research B8). Another teacher's class, an activity of another class, an
 * attempt of another activity or an activity that is not an ASSIGNMENT with the option → 404. A read:
 * not audited.
 */
@Injectable()
export class CodeRunReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async forTeacher(
    teacherId: string,
    classId: string,
    activityId: string,
    attemptId: string,
  ): Promise<AttemptCodeRunSummary> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const attempt = await this.prisma.activityAttempt.findFirst({
      where: {
        id: attemptId,
        activityId,
        activity: { classId, type: "ASSIGNMENT", codeExecutionAllowed: true },
      },
      select: { id: true, participants: { select: { studentUserId: true } } },
    });
    if (!attempt) throw notFound();
    const now = this.clock.now();
    const { counts, lasts } = await this.prisma.runInTransaction(async (tx) => {
      // 023/FR-021: every participant runs as themselves, so each one's stale runs settle.
      for (const { studentUserId } of attempt.participants) {
        await settleStaleRuns(tx, this.audit, {
          now,
          scope: { studentUserId },
          disabled: !this.config.codeRunner.enabled,
        });
      }
      // Y8: every row is an accepted request; the last finished is the greatest `finished_at` (ties by id).
      const counts = await tx.$queryRaw<CountRow[]>`
        SELECT q.id AS question_id,
               count(r.id)::int AS run_count,
               coalesce(bool_or(r.status IN ('QUEUED', 'RUNNING')), false) AS pending,
               (array_agg(r.id ORDER BY r.finished_at DESC, r.id DESC) FILTER (WHERE r.status IN ('COMPLETED', 'FAILED')))[1] AS last_id
        FROM class_activity_questions q
        LEFT JOIN code_runs r ON r.question_id = q.id AND r.attempt_id = ${attempt.id}::uuid
        WHERE q.activity_id = ${activityId}::uuid AND q.type = 'CODE'
        GROUP BY q.id, q.position
        ORDER BY q.position`;
      const ids = counts.flatMap((row) => (row.last_id ? [row.last_id] : []));
      const lasts =
        ids.length === 0
          ? []
          : await tx.codeRun.findMany({
              where: { id: { in: ids } },
              select: { id: true, ...LAST_FINISHED_SELECT },
            });
      return { counts, lasts };
    });
    const byId = new Map(lasts.map((row) => [row.id, row]));
    return {
      questions: counts.map((row) =>
        toTeacherRunSummary(
          row.question_id,
          { runCount: row.run_count, pending: row.pending },
          row.last_id ? (byId.get(row.last_id) ?? null) : null,
        ),
      ),
    };
  }
}
