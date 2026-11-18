import { Injectable } from "@nestjs/common";
import type { ClassStatus, Cohort, SchoolClass } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { findOwnedOrNotFound, type ResourceContextPolicy } from "../access-control/resource-context";
import { classLabel } from "./class-label";
import { effectiveStatus } from "./effective-status";

/**
 * A disciplina da turma in the teacher's context, loaded with its turma (027 research Q4): `status` is the
 * **effective** status (the most restrictive of the cohort's and the class's own, FR-023), so every check
 * of 004–026 (`status === "ARCHIVED"` → `409 PLAN_ARCHIVED`, activity creation, attendance, exams) sees the
 * cohort's closing too; `ownStatus` is the class's own, for the status route; `name` is the label
 * "<disciplina> · <turma>" (`classLabel`, FR-030) that the views of 004–026 show as the class's name.
 */
export type ClassInContext = SchoolClass & { ownStatus: ClassStatus; cohort: Cohort; name: string };

/**
 * A class is in a teacher's context only when `teacher_id` is that teacher (003 D7). The lookup
 * is already scoped (`WHERE id = $1 AND teacher_id = $2`), so another teacher's class and a
 * missing one are the same `404 NOT_FOUND`.
 */
@Injectable()
export class ClassContextPolicy implements ResourceContextPolicy<ClassInContext> {
  constructor(private readonly prisma: PrismaService) {}

  async findInContext(teacherId: string, classId: string, db: Tx = this.prisma): Promise<ClassInContext | null> {
    const row = await db.schoolClass.findFirst({
      where: { id: classId, teacherId },
      include: { cohort: true, subject: { select: { name: true } } },
    });
    if (!row) return null;
    const { subject, ...schoolClass } = row;
    return {
      ...schoolClass,
      name: classLabel(subject?.name, row.cohort.name),
      ownStatus: row.status,
      status: effectiveStatus(row.cohort.status, row.status),
    };
  }

  /** Throws `404 NOT_FOUND` when the class does not exist or belongs to another teacher. */
  findOwnedOrNotFound(teacherId: string, classId: string, db?: Tx): Promise<ClassInContext> {
    return findOwnedOrNotFound(() => this.findInContext(teacherId, classId, db));
  }
}
