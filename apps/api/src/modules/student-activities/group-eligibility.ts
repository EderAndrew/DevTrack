import type { Tx } from "../../platform/database/transaction";
import type { PrismaService } from "../../platform/database/prisma.service";

/**
 * The classmates a student may bring into a group of this work (023/FR-005, research U6): ACTIVE in the
 * activity's class, marked present in its attendance, with no participation in any attempt of the work,
 * never the caller. Only id and name, by name. Read by the candidates list and, under the activity's
 * advisory lock, by the start and the inclusion to re-check the chosen ids.
 */
export async function eligibleClassmates(
  db: Tx | PrismaService,
  activityId: string,
  callerId: string,
): Promise<{ id: string; name: string }[]> {
  return db.$queryRaw<{ id: string; name: string }[]>`
    SELECT u.id, u.name
    FROM class_activities ca
    JOIN enrollments e ON e.class_id = ca.class_id AND e.status = 'ACTIVE'
    JOIN users u ON u.id = e.student_user_id
    JOIN activity_attendances aa ON aa.activity_id = ca.id AND aa.student_user_id = e.student_user_id
    WHERE ca.id = ${activityId}::uuid
      AND e.student_user_id <> ${callerId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM attempt_participants p WHERE p.activity_id = ca.id AND p.student_user_id = e.student_user_id
      )
    ORDER BY u.name, u.id`;
}

/** Serializes the starts and inclusions of one activity (research U6): a classmate never ends in two groups. */
export async function lockActivityGroups(tx: Tx, activityId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('activity-group'), hashtext(${activityId}::text))`;
}
