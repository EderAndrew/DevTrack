import type { ResourceOwnership } from "../../ai/definitions/types";

/** `SYLLABUS_DOCUMENT` belongs to a workspace through its subject's teacher (007 contracts/curriculum-agent.md). */
export const syllabusDocumentOwnership: ResourceOwnership = {
  async ownedBy(db, workspaceId, resourceId) {
    const document = await db.syllabusDocument.findFirst({
      where: { id: resourceId, subject: { teacherId: workspaceId } },
      select: { id: true },
    });
    return document !== null;
  },
};
