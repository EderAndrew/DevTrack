import { Injectable } from "@nestjs/common";
import type { MyClassList } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { classLabel } from "../classes/class-label";

/**
 * The student's own classes (003 US7): the classes of the session's active enrollments, most
 * recent first, with the teacher's name and (026) the subject's. Nothing about other students,
 * invitations or the class's administration.
 *
 * 027 (provisional until US8, T058): an enrollment is in a turma, so each disciplina da turma of the
 * enrolled cohorts is one item, named by its label ("<disciplina> · <turma>", FR-030), with the cohort's
 * code, academic year and period.
 */
@Injectable()
export class MyClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<MyClassList> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentUserId: userId, status: "ACTIVE" },
      orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
      select: {
        enrolledAt: true,
        cohort: {
          select: {
            name: true,
            code: true,
            academicYear: true,
            period: true,
            classes: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true, teacher: { select: { name: true } }, subject: { select: { name: true } } },
            },
          },
        },
      },
    });
    return {
      items: enrollments.flatMap(({ enrolledAt, cohort }) =>
        cohort.classes.map((schoolClass) => ({
          id: schoolClass.id,
          name: classLabel(schoolClass.subject?.name, cohort.name),
          code: cohort.code,
          academicYear: cohort.academicYear,
          period: cohort.period,
          teacherName: schoolClass.teacher.name,
          subjectName: schoolClass.subject?.name ?? null,
          enrolledAt: enrolledAt.toISOString(),
        })),
      ),
    };
  }
}
