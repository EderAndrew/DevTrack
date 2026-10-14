import type { ResourceOwnership } from "../../ai/definitions/types";

/** `EXAM_GENERATION_REQUEST` belongs to the teacher who made it (018 data-model). */
export const examGenerationRequestOwnership: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    const request = await db.examGenerationRequest.findFirst({ where: { id: resourceId, teacherId: workspaceId }, select: { id: true } });
    return request !== null;
  },
};
