-- 021 — Code Runner nos Trabalhos (specs/021-work-code-runner/data-model.md, research Y1, Y5).
-- The teacher's option to let students run their code on a work's CODE questions. The runs themselves
-- are 019's; this only widens where one may start and refuses a new one while the attempt is paused.

-- Y1: the option of a work (ASSIGNMENT); every existing activity keeps false (FR-003).
ALTER TABLE "class_activities" ADD COLUMN "code_execution_allowed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_code_execution_allowed_chk"
  CHECK ("type" = 'ASSIGNMENT' OR NOT "code_execution_allowed");

-- Y1: fixed once a student started, like the 015 mode and AI help (the service answers 409 first).
CREATE FUNCTION "class_activities_code_execution_fixed"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code_execution_allowed" IS DISTINCT FROM OLD."code_execution_allowed"
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the code execution option of activity % is fixed once a student started', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "class_activities_code_execution_fixed"
  BEFORE UPDATE OF "code_execution_allowed" ON "class_activities"
  FOR EACH ROW EXECUTE FUNCTION "class_activities_code_execution_fixed"();

-- Y5: a run is of a CODE question of an EXERCISE (019) or of an ASSIGNMENT with the option; never an EXAM.
CREATE OR REPLACE FUNCTION "code_runs_insert_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  question_kind "activity_question_type";
  activity_kind "class_activity_type";
  execution_allowed boolean;
BEGIN
  IF NEW."status" <> 'QUEUED' OR NEW."content_purged_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a code run starts QUEUED'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT q."type", a."type", a."code_execution_allowed" INTO question_kind, activity_kind, execution_allowed
    FROM "class_activity_questions" q JOIN "class_activities" a ON a."id" = q."activity_id"
    WHERE q."id" = NEW."question_id" AND q."activity_id" = NEW."activity_id";
  IF FOUND AND (question_kind <> 'CODE'
                OR NOT (activity_kind = 'EXERCISE' OR activity_kind = 'ASSIGNMENT' AND execution_allowed)) THEN
    RAISE EXCEPTION 'code run question % is not a CODE question of an exercise or of a work that allows running code', NEW."question_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Y5: no new run while the attempt has an open pause on an ACTIVE activity (016's rule). Only the
-- insert: the worker still claims and finishes a run of a paused attempt (US4-7).
CREATE TRIGGER "code_runs_paused"
  BEFORE INSERT ON "code_runs"
  FOR EACH ROW EXECUTE FUNCTION "attempt_paused_writes"();
