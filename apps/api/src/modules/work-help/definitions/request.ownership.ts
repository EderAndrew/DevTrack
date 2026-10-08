import type { ResourceOwnership } from "../../ai/definitions/types";

/** `WORK_HELP_REQUEST` belongs to the student who asked (015 data-model, the execution's workspace). */
export const workHelpRequestOwnership: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    const request = await db.workHelpRequest.findFirst({ where: { id: resourceId, studentUserId: workspaceId }, select: { id: true } });
    return request !== null;
  },
};
