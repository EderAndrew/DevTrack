import { Inject, Injectable } from "@nestjs/common";
import { type CreateFeedbackRequest, FEEDBACK_DAILY_LIMIT, type StudentFeedback, type StudentFeedbackPage } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { afterCursor, decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { rateLimited } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { STUDENT_FEEDBACK_SELECT, toStudentFeedback } from "./views/student-feedback-view";

/** Thrown inside the transaction when the student passed the limit (→ 429 after the rollback). */
class OverLimit extends Error {
  constructor(readonly retryAfterSec: number) {
    super("student-feedback limit");
  }
}

/** The audit scope of a refusal (contracts/audit-events.md). */
const RATE_SCOPE = "student-feedback";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Keyset page size of "Meus feedbacks" (research J7). */
const PAGE_SIZE = 50;

/**
 * The student's feedback (020 US1, research J3, J4). Everything comes from the session and the server:
 * the student, the status and both times (the injected `Clock`). Under a per-student advisory lock, a
 * known `submissionId` returns its feedback (200, nothing counted or audited); otherwise at most
 * `FEEDBACK_DAILY_LIMIT` new feedbacks in the 24 h before now, past which the API answers `429` with
 * `Retry-After` = seconds until the oldest of them turns 24 h old, and `student_feedback.rate_limited`
 * is recorded after the rollback. Neither the message nor the origin path reaches the audit or a log.
 * The own list (US3) is scoped to the session student only, no enrollment needed, and writes no event.
 */
@Injectable()
export class StudentFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `created: false` → 200 with the feedback already stored under this `submissionId`. */
  async create(studentId: string, body: CreateFeedbackRequest, requestId: string | null): Promise<{ feedback: StudentFeedback; created: boolean }> {
    const now = this.clock.now();
    try {
      const { id, created } = await this.prisma.runInTransaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('student-feedback'), hashtext(${studentId}))`;
        const known = await tx.studentFeedback.findUnique({
          where: { studentId_submissionId: { studentId, submissionId: body.submissionId } },
          select: { id: true },
        });
        if (known) return { id: known.id, created: false };

        const recent = await tx.studentFeedback.findMany({
          where: { studentId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
          take: FEEDBACK_DAILY_LIMIT,
        });
        if (recent.length >= FEEDBACK_DAILY_LIMIT) {
          throw new OverLimit((recent[0]!.createdAt.getTime() + DAY_MS - now.getTime()) / 1000);
        }

        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO student_feedbacks (student_id, submission_id, category, message, origin_path, created_at, status_changed_at)
          VALUES (${studentId}::uuid, ${body.submissionId}::uuid, ${body.category}::student_feedback_category,
                  ${body.message}, ${body.originPath ?? null}, ${now}, ${now})
          ON CONFLICT (student_id, submission_id) DO NOTHING
          RETURNING id`;
        const feedbackId = inserted[0]?.id;
        // Unreachable under the lock; a conflict still answers the stored feedback.
        if (!feedbackId) {
          const stored = await tx.studentFeedback.findUniqueOrThrow({
            where: { studentId_submissionId: { studentId, submissionId: body.submissionId } },
            select: { id: true },
          });
          return { id: stored.id, created: false };
        }
        await this.audit.record(tx, {
          type: "student_feedback.submitted",
          actorType: "USER",
          actorUserId: studentId,
          targetType: "STUDENT_FEEDBACK",
          targetId: feedbackId,
          requestId,
          metadata: { category: body.category },
        });
        return { id: feedbackId, created: true };
      });
      const row = await this.prisma.studentFeedback.findUniqueOrThrow({ where: { id }, select: STUDENT_FEEDBACK_SELECT });
      return { feedback: toStudentFeedback(row), created };
    } catch (error) {
      if (error instanceof OverLimit) return this.overLimit(studentId, error, requestId);
      throw error;
    }
  }

  /** "Meus feedbacks": the student's own, newest first, `(created_at DESC, id DESC)`. */
  async listMine(studentId: string, cursor: string | undefined): Promise<StudentFeedbackPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.studentFeedback.findMany({
      where: { studentId, ...(after ? { AND: [afterCursor(after)] } : {}) },
      select: STUDENT_FEEDBACK_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map(toStudentFeedback),
      nextCursor: rows.length > PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  /** 429 with `Retry-After`, auditing `student_feedback.rate_limited` once the refused create is rolled back. */
  private async overLimit(studentId: string, error: OverLimit, requestId: string | null): Promise<never> {
    await this.audit.record(this.prisma, {
      type: "student_feedback.rate_limited",
      actorType: "USER",
      actorUserId: studentId,
      requestId,
      metadata: { scope: RATE_SCOPE },
    });
    throw rateLimited(error.retryAfterSec);
  }
}
