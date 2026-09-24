import { Injectable } from "@nestjs/common";
import type { Subject } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { findOwnedOrNotFound, type ResourceContextPolicy } from "../access-control/resource-context";

/**
 * A subject is in a teacher's context only when `teacher_id` is that teacher (004 research E3).
 * The lookup is scoped (`WHERE id = $1 AND teacher_id = $2`), so another teacher's subject and a
 * missing one are the same `404 NOT_FOUND`. Syllabus documents and revisions are reached through
 * their subject.
 */
@Injectable()
export class SubjectContextPolicy implements ResourceContextPolicy<Subject> {
  constructor(private readonly prisma: PrismaService) {}

  findInContext(teacherId: string, subjectId: string, db: Tx = this.prisma): Promise<Subject | null> {
    return db.subject.findFirst({ where: { id: subjectId, teacherId } });
  }

  /** Throws `404 NOT_FOUND` when the subject does not exist or belongs to another teacher. */
  findOwnedOrNotFound(teacherId: string, subjectId: string, db?: Tx): Promise<Subject> {
    return findOwnedOrNotFound(() => this.findInContext(teacherId, subjectId, db));
  }
}
