import { Inject, Injectable } from "@nestjs/common";
import type { StudentCalendar } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { planningToday } from "../class-plans/planning-date";
import { isoDate } from "../classes/class.view";
import { toStudentCalendar } from "./views/student-calendar.view";

/**
 * The student's calendar of one disciplina da turma (031 US3, FR-021/FR-022, research CK6/CK7). The ACTIVE enrollment
 * in the turma of that class is checked first, with the 026 query; any other case (another turma, an ended
 * enrollment, an unknown class) is the same `404`. Then only the allowed columns are selected — never topics, the
 * absence reason, a meeting's number or status, ids or times — and the shape is copied by the allowlist view.
 * The class's effective status does not hide the calendar: only the enrollment decides. Not audited (a read).
 */
@Injectable()
export class StudentCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async read(userId: string, classId: string): Promise<StudentCalendar> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentUserId: userId,
        status: "ACTIVE",
        cohort: { classes: { some: { id: classId } } },
      },
      select: { id: true },
    });
    if (!enrollment) throw notFound();

    const schoolClass = await this.prisma.schoolClass.findUniqueOrThrow({
      where: { id: classId },
      select: {
        startsOn: true,
        endsOn: true,
        subject: { select: { name: true } },
        cohort: { select: { name: true } },
        teacher: { select: { name: true } },
      },
    });
    const meetings = await this.prisma.classMeeting.findMany({
      where: { classId },
      select: { meetingDate: true, kind: true, description: true },
    });
    const days = await this.prisma.classCalendarDay.findMany({
      where: { classId },
      select: {
        dayDate: true,
        kind: true,
        description: true,
        absenceNotice: true,
      },
    });

    return toStudentCalendar({
      classId,
      // A class migrated without subject is named by its turma (026/030).
      subjectName: schoolClass.subject?.name ?? schoolClass.cohort.name,
      teacherName: schoolClass.teacher.name,
      startsOn: isoDate(schoolClass.startsOn),
      endsOn: isoDate(schoolClass.endsOn),
      today: planningToday(this.clock.now()),
      meetings: meetings.map((row) => ({
        date: isoDate(row.meetingDate)!,
        kind: row.kind,
        description: row.description,
      })),
      days: days.map((row) => ({
        date: isoDate(row.dayDate)!,
        kind: row.kind,
        description: row.description,
        absenceNotice: row.absenceNotice,
      })),
    });
  }
}
