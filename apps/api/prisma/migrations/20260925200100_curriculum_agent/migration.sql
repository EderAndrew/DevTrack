-- 007 (Curriculum Agent): the proposal an AI_ASSISTED revision came from (FR-031, FR-034).
ALTER TABLE "syllabus_revisions" ADD COLUMN "ai_proposal_id" UUID;

-- One revision per proposal: applying the same proposal twice never creates a second draft.
CREATE UNIQUE INDEX "syllabus_revisions_ai_proposal_id_key" ON "syllabus_revisions"("ai_proposal_id");

ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_ai_proposal_id_fkey"
  FOREIGN KEY ("ai_proposal_id") REFERENCES "ai_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_ai_proposal_chk"
  CHECK (("source" = 'AI_ASSISTED') = ("ai_proposal_id" IS NOT NULL));
