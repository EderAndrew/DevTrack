import { Injectable } from "@nestjs/common";
import type { MyClassList } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";

/**
 * The student's own classes (003 US7): the classes of the session's active enrollments, most
 * recent first, with the teacher's name and (026) the subject's. Nothing about other students,
 * invitations or the class's administration.
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
        schoolClass: {
          select: {
            id: true,
            name: true,
            code: true,
            academicYear: true,
            period: true,
            teacher: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
      },
    });
    return {
      items: enrollments.map(({ enrolledAt, schoolClass: { teacher, subject, ...schoolClass } }) => ({
        ...schoolClass,
        teacherName: teacher.name,
        subjectName: subject?.name ?? null,
        enrolledAt: enrolledAt.toISOString(),
      })),
    };
  }
}
