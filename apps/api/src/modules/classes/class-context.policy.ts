import { Injectable } from "@nestjs/common";
import type { SchoolClass } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { findOwnedOrNotFound, type ResourceContextPolicy } from "../access-control/resource-context";

/**
 * A class is in a teacher's context only when `teacher_id` is that teacher (003 D7). The lookup
 * is already scoped (`WHERE id = $1 AND teacher_id = $2`), so another teacher's class and a
 * missing one are the same `404 NOT_FOUND`.
 */
@Injectable()
export class ClassContextPolicy implements ResourceContextPolicy<SchoolClass> {
  constructor(private readonly prisma: PrismaService) {}

  findInContext(teacherId: string, classId: string, db: Tx = this.prisma): Promise<SchoolClass | null> {
    return db.schoolClass.findFirst({ where: { id: classId, teacherId } });
  }

  /** Throws `404 NOT_FOUND` when the class does not exist or belongs to another teacher. */
  findOwnedOrNotFound(teacherId: string, classId: string, db?: Tx): Promise<SchoolClass> {
    return findOwnedOrNotFound(() => this.findInContext(teacherId, classId, db));
  }
}
