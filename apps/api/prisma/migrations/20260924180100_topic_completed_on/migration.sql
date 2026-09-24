-- 004/US9: the date of the meeting a topic was completed in, kept after it is archived (FR-058).
ALTER TABLE "topics" ADD COLUMN "completed_on" DATE;

ALTER TABLE "topics" ADD CONSTRAINT "topics_completed_chk"
  CHECK (("completed_on" IS NOT NULL) = (
    "status" = 'COMPLETED' OR ("status" = 'ARCHIVED' AND "status_before_archive" = 'COMPLETED')
  ));
