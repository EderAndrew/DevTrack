import type { Tx } from "../../platform/database/transaction";
import { notFound } from "../../platform/http/errors";
import type { ClassContextPolicy, ClassInContext } from "../classes/class-context.policy";

/**
 * Locks the teacher's class row (`SELECT … FOR UPDATE`) for the rest of the transaction, so writes
 * that start before the class has a plan (calendar, syllabus selection) are serialized too.
 * Another teacher's class or a missing one → `404 NOT_FOUND`.
 */
export async function lockOwnedClass(
  tx: Tx,
  context: ClassContextPolicy,
  teacherId: string,
  classId: string,
): Promise<ClassInContext> {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
  if (!locked) throw notFound();
  return context.findOwnedOrNotFound(teacherId, classId, tx);
}
