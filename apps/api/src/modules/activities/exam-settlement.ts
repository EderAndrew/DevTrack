import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { settleClassExams, settleExpiredExamAttempts, settleStudentExams } from "./submission/settle-exam";

/**
 * Every touch of an exam attempt settles it first when its time is over (018 research T5), each in its
 * own transaction committed before the operation runs: a save, submit or events batch then refused
 * with `409 EXAM_TIME_OVER` doesn't roll the settlement back with it. A settlement is idempotent, so a
 * touch that finds nothing to settle writes nothing. Exported for `student-activities` and the 015
 * events and review, which reach the activity's time only through this module.
 */
@Injectable()
export class ExamSettlement {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The session student's attempt of one activity (nothing when it isn't an EXAM). */
  ofAttempt(studentUserId: string, activityId: string, now: Date, requestId: string | null): Promise<number> {
    return this.prisma.runInTransaction((tx) => settleExpiredExamAttempts(tx, this.audit, { activityId, studentUserId, now, requestId }));
  }

  /** Every expired attempt of one activity of the teacher's class (nothing when it isn't an EXAM of that class). */
  ofActivity(classId: string, activityId: string, now: Date, requestId: string | null): Promise<number> {
    return this.prisma.runInTransaction((tx) => settleExpiredExamAttempts(tx, this.audit, { classId, activityId, now, requestId }));
  }

  /** Every exam of a class with an attempt in progress (the teacher's list of activities). */
  ofClass(classId: string, now: Date, requestId: string | null): Promise<number> {
    return this.prisma.runInTransaction((tx) => settleClassExams(tx, this.audit, { classId, now, requestId }));
  }

  /** Every exam attempt of the session student still in progress (the list and the dashboard). */
  ofStudent(studentUserId: string, now: Date, requestId: string | null): Promise<number> {
    return this.prisma.runInTransaction((tx) => settleStudentExams(tx, this.audit, { studentUserId, now, requestId }));
  }
}
