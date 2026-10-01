import type { ResourceOwnership } from "../../ai/definitions/types";

/** `WORK_GENERATION_REQUEST` belongs to the teacher who made it (011 data-model). */
export const workGenerationRequestOwnership: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    const request = await db.workGenerationRequest.findFirst({ where: { id: resourceId, teacherId: workspaceId }, select: { id: true } });
    return request !== null;
  },
};
