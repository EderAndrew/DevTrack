import { Inject, Injectable } from "@nestjs/common";
import { AI_HELP_ALLOWANCE, type AiHelpAllowance, type TeacherHelpState } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { reconcileHelpRequests } from "./help/reconcile";
import { HELP_REQUEST_SELECT, toTeacherHelpItem } from "./help/views";

/**
 * The helps of one attempt for its teacher (015 US4, FR-025): each question's requests with the
 * student's question, the orientation and, for a blocked or failed one, its reason code; `used`
 * counts DELIVERED only. Nothing here changes a grade or labels the student (FR-026). A pending
 * request whose execution ended is reconciled first, as on the student's read. Another teacher's
 * class, an activity of another class or an attempt of another activity → 404.
 */
@Injectable()
export class WorkHelpReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async forTeacher(teacherId: string, classId: string, activityId: string, attemptId: string): Promise<TeacherHelpState> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const attempt = await this.prisma.activityAttempt.findFirst({
      where: { id: attemptId, activityId, activity: { classId } },
      select: { id: true, activity: { select: { aiHelpAllowance: true } } },
    });
    if (!attempt) throw notFound();
    const rows = await this.prisma.runInTransaction(async (tx) => {
      await reconcileHelpRequests(tx, this.audit, attempt.id, this.clock.now());
      return tx.workHelpRequest.findMany({
        where: { attemptId: attempt.id },
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
        select: { ...HELP_REQUEST_SELECT, questionRef: { select: { position: true } } },
      });
    });
    const allowance: AiHelpAllowance = attempt.activity.aiHelpAllowance === AI_HELP_ALLOWANCE ? AI_HELP_ALLOWANCE : 0;
    return {
      allowance,
      used: rows.filter((row) => row.status === "DELIVERED").length,
      items: rows.map(({ questionRef, ...row }) => toTeacherHelpItem({ ...row, questionPosition: questionRef.position })),
    };
  }
}
