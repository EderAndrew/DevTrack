import type { ResourceOwnership } from "../../ai/definitions/types";

/** `EXERCISE_GENERATION_BATCH` belongs to the teacher who requested it (010 data-model). */
export const exerciseBatchOwnership: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    const batch = await db.exerciseGenerationBatch.findFirst({ where: { id: resourceId, teacherId: workspaceId }, select: { id: true } });
    return batch !== null;
  },
};
