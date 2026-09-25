import type { ResourceOwnership } from "../../../src/modules/ai/definitions/types";

/**
 * The only resource type of the tests: a subject (004), owned when its `teacher_id` is the
 * execution's workspace — the same rule as `SubjectContextPolicy`. Counts its lookups so tests can
 * prove that invalid arguments never reach the database (006/US3-4).
 */
export const subjectLookups = { count: 0 };

export const SUBJECT_OWNERSHIP: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    subjectLookups.count += 1;
    const subject = await db.subject.findFirst({ where: { id: resourceId, teacherId: workspaceId }, select: { id: true } });
    return subject !== null;
  },
};

export const REFERENCE_RESOURCES = { SUBJECT: SUBJECT_OWNERSHIP };
