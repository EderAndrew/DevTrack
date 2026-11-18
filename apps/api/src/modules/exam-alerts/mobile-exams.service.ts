import { Inject, Injectable } from "@nestjs/common";
import type { MobileExamList } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { closesAt } from "../activities/status/exam-time";
import { CLASS_LABEL_SELECT, labelOf } from "../classes/class-label";

/** The longest an exam can stay in progress after its publication: a 60 min start window plus 120 min. */
const LONGEST_EXAM_MS = (60 + 120) * 60_000;

/**
 * "Provas em andamento" (024/FR-006, research Y10): the teacher's EXAM activities in classes they own and
 * that are not archived, published, not closed or cancelled, and before their latest end (`closesAt`, the
 * 018 rule), by the server clock; soonest end first. `muted` tells the teacher's choice of US4.
 */
@Injectable()
export class MobileExamsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(teacherId: string): Promise<MobileExamList> {
    const now = this.clock.now();
    const rows = await this.prisma.classActivity.findMany({
      where: {
        type: "EXAM",
        status: "ACTIVE",
        publishAt: { lte: now, gt: new Date(now.getTime() - LONGEST_EXAM_MS) },
        // Not archived by its effective status (027 FR-023): neither the class nor its cohort.
        schoolClass: { teacherId, status: { not: "ARCHIVED" }, cohort: { status: { not: "ARCHIVED" } } },
      },
      select: {
        id: true,
        classId: true,
        title: true,
        publishAt: true,
        durationMinutes: true,
        startWindowMinutes: true,
        closedAt: true,
        cancelledAt: true,
        schoolClass: { select: CLASS_LABEL_SELECT },
      },
    });
    const muted = new Set(
      (
        await this.prisma.examAlertMute.findMany({
          where: { teacherUserId: teacherId, activityId: { in: rows.map((row) => row.id) } },
          select: { activityId: true },
        })
      ).map((row) => row.activityId),
    );
    const items = rows
      .map((row) => ({
        row,
        closes: closesAt({
          publishAt: row.publishAt,
          durationMinutes: row.durationMinutes ?? 0,
          startWindowMinutes: row.startWindowMinutes ?? 0,
          closedAt: row.closedAt,
          cancelledAt: row.cancelledAt,
        }),
      }))
      .filter(({ closes }) => closes > now)
      .sort((a, b) => a.closes.getTime() - b.closes.getTime() || a.row.title.localeCompare(b.row.title, "pt-BR"));
    return {
      items: items.map(({ row, closes }) => ({
        activityId: row.id,
        classId: row.classId,
        className: labelOf(row.schoolClass),
        title: row.title,
        closesAt: closes.toISOString(),
        muted: muted.has(row.id),
      })),
      serverNow: now.toISOString(),
    };
  }
}
