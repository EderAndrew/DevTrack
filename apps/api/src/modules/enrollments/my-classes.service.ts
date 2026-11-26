import { Injectable } from "@nestjs/common";
import type { MyCohortList } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { effectiveStatus } from "../classes/effective-status";

/**
 * "Minhas turmas" of the student (003 US7, 027 US8, FR-025): the turmas of the session's ACTIVE enrollments grouped by
 * ano letivo (most recent first; within a year the most recent enrollment first), each once with every disciplina da
 * turma (in the order they were added) and its teacher's name, whatever its effective status — a closed turma or an
 * archived disciplina stays readable (FR-004). Each turma carries the date of the student's own enrollment (030/FR-012).
 * Nothing about other students, invitations or the administration.
 */
@Injectable()
export class MyClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<MyCohortList> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentUserId: userId, status: "ACTIVE" },
      orderBy: [{ cohort: { academicYear: "desc" } }, { enrolledAt: "desc" }, { id: "desc" }],
      select: {
        enrolledAt: true,
        cohort: {
          select: {
            id: true,
            name: true,
            code: true,
            academicYear: true,
            period: true,
            status: true,
            classes: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: { id: true, status: true, teacher: { select: { name: true } }, subject: { select: { name: true } } },
            },
          },
        },
      },
    });
    const years: MyCohortList["years"] = [];
    for (const { cohort, enrolledAt } of enrollments) {
      let year = years.at(-1);
      if (year?.academicYear !== cohort.academicYear) {
        year = { academicYear: cohort.academicYear, cohorts: [] };
        years.push(year);
      }
      year.cohorts.push({
        id: cohort.id,
        name: cohort.name,
        code: cohort.code,
        period: cohort.period,
        status: cohort.status,
        enrolledAt: enrolledAt.toISOString(),
        classes: cohort.classes.map((schoolClass) => ({
          classId: schoolClass.id,
          subjectName: schoolClass.subject?.name ?? null,
          teacherName: schoolClass.teacher.name,
          effectiveStatus: effectiveStatus(cohort.status, schoolClass.status),
        })),
      });
    }
    return { years };
  }
}
