import { Injectable } from "@nestjs/common";
import type { ExamAlertPreference } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { MobileWriteLimit } from "../../platform/http/mobile-write-limit";

/**
 * "Silenciar avisos desta prova" (024/US4, research Y8): muted is a row per teacher and exam, for all of the
 * teacher's phones; on is no row. Idempotent (`INSERT … ON CONFLICT DO NOTHING` / `DELETE`), from the app or
 * the web. Only an EXAM of one of the teacher's classes that is not archived; anything else is the same 404.
 * `AlertRecipients` reads the row at send time, so an alert of a muted exam ends SKIPPED and is never sent
 * late (024/FR-021). Not audited: a preference, not a fact of the exam (contracts/audit-events.md).
 */
@Injectable()
export class ExamAlertPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassContextPolicy,
    private readonly limit: MobileWriteLimit,
  ) {}

  set(teacherId: string, classId: string, activityId: string, muted: boolean): Promise<ExamAlertPreference> {
    return this.prisma.runInTransaction(async (tx) => {
      await this.limit.assert(tx, teacherId);
      const schoolClass = await this.classes.findInContext(teacherId, classId, tx);
      if (!schoolClass || schoolClass.status === "ARCHIVED") throw notFound();
      const exam = await tx.classActivity.findFirst({ where: { id: activityId, classId, type: "EXAM" }, select: { id: true } });
      if (!exam) throw notFound();
      if (muted) {
        await tx.$executeRaw`
          INSERT INTO exam_alert_mutes (teacher_user_id, activity_id, created_at)
          VALUES (${teacherId}::uuid, ${exam.id}::uuid, now())
          ON CONFLICT DO NOTHING`;
      } else {
        await tx.examAlertMute.deleteMany({ where: { teacherUserId: teacherId, activityId: exam.id } });
      }
      return { muted };
    });
  }
}
