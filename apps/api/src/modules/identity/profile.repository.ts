import { Injectable } from "@nestjs/common";
import type { StudentProfile, TeacherProfile } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";

/**
 * At most one profile of each kind per user (FR-006). Both `ensure*` calls are idempotent and
 * concurrency-safe (`INSERT … ON CONFLICT DO NOTHING`): an existing profile keeps its display
 * name, so reactivating a role never creates or overwrites a profile (FR-051).
 */
@Injectable()
export class ProfileRepository {
  async ensureTeacherProfile(tx: Tx, userId: string, displayName: string): Promise<TeacherProfile> {
    await tx.teacherProfile.createMany({ data: [{ userId, displayName }], skipDuplicates: true });
    return tx.teacherProfile.findUniqueOrThrow({ where: { userId } });
  }

  async ensureStudentProfile(tx: Tx, userId: string, displayName: string): Promise<StudentProfile> {
    await tx.studentProfile.createMany({ data: [{ userId, displayName }], skipDuplicates: true });
    return tx.studentProfile.findUniqueOrThrow({ where: { userId } });
  }
}
