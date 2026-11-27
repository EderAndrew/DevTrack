-- 032 (research AP1, AP5, AP7, data-model.md): the period of an ASSIGNMENT and of an EXAM is
-- `publish_at` → `deadline`. The exam's start window goes; every exam gets the end it had as
-- `closesAt` (publication + window + duration), so no started attempt's end moves (SC-005):
-- `started_at ≤ publish_at + window` ⇒ `started_at + duration ≤ deadline`.

-- (1) The CHECK that kept the deadline off an EXAM goes first, then every exam gets its end.
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_type_fields_chk";

UPDATE "class_activities"
   SET "deadline" = "publish_at" + make_interval(mins => "start_window_minutes"::int + "duration_minutes"::int)
 WHERE "type" = 'EXAM';

-- (2) A deadline for ASSIGNMENT and EXAM (the period's end); a late policy only for ASSIGNMENT
-- (`REJECT` on every new one, `ACCEPT_MARKED` only on works applied before 032, AP2); a grade for
-- both; a result release never for EXERCISE.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_type_fields_chk"
  CHECK (
    ("type" <> 'EXERCISE') = ("total_grade" IS NOT NULL)
    AND ("type" IN ('ASSIGNMENT', 'EXAM')) = ("deadline" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT') = ("late_policy" IS NOT NULL)
    AND ("type" <> 'EXERCISE' OR "result_released_at" IS NULL)
  );

-- An exam's duration and inactivity limit, set iff EXAM; its period holds at least the duration (FR-002).
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_exam_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_exam_chk"
  CHECK (
    ("type" = 'EXAM') = ("duration_minutes" IS NOT NULL)
    AND ("type" = 'EXAM') = ("inactivity_limit_seconds" IS NOT NULL)
    AND ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 120)
    AND ("inactivity_limit_seconds" IS NULL OR "inactivity_limit_seconds" BETWEEN 30 AND 60)
    AND ("type" <> 'EXAM' OR "deadline" >= "publish_at" + make_interval(mins => "duration_minutes"::int))
  );

-- (3) 012 + 018 + 032: the exam's source and timing never change, and once a student started an
-- exam its end only moves later (AP5). No clock here: "published ⇒ only later" is the service's,
-- with the injected `Clock`.
CREATE OR REPLACE FUNCTION "class_activities_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."teacher_id" IS DISTINCT FROM OLD."teacher_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."total_grade" IS DISTINCT FROM OLD."total_grade"
     OR NEW."question_count" IS DISTINCT FROM OLD."question_count"
     OR NEW."source_work_id" IS DISTINCT FROM OLD."source_work_id"
     OR NEW."source_exam_id" IS DISTINCT FROM OLD."source_exam_id"
     OR NEW."duration_minutes" IS DISTINCT FROM OLD."duration_minutes"
     OR NEW."inactivity_limit_seconds" IS DISTINCT FROM OLD."inactivity_limit_seconds"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."release_mode" IS DISTINCT FROM OLD."release_mode" THEN
    RAISE EXCEPTION 'the class, type, grade, source, exam timing and release mode of activity % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."execution_mode" IS DISTINCT FROM OLD."execution_mode"
      OR NEW."ai_help_allowance" IS DISTINCT FROM OLD."ai_help_allowance")
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the mode and AI help of activity % are fixed once a student started', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."type" = 'EXAM' AND NEW."deadline" < OLD."deadline"
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the end of exam % only moves later once a student started', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CANCELLED' AND NEW."status" <> 'CANCELLED'
     OR OLD."status" = 'CLOSED' AND NEW."status" = 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % cannot go from % to %', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- (4) 018 + 032: RETURNED only while the attempt still has time, which the period's end also caps (AP3).
CREATE OR REPLACE FUNCTION "exam_attempt_holds_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_row RECORD;
  ends_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hold % cannot be deleted', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."occurrence_ordinal" IS DISTINCT FROM OLD."occurrence_ordinal"
     OR NEW."opened_at" IS DISTINCT FROM OLD."opened_at" THEN
    RAISE EXCEPTION 'the facts of hold % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."resolution" IS NOT NULL THEN
    RAISE EXCEPTION 'hold % was already resolved', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT a."teacher_id", a."status", a."closed_at", a."cancelled_at", a."duration_minutes", a."deadline", t."started_at" INTO activity_row
    FROM "class_activities" a JOIN "activity_attempts" t ON t."activity_id" = a."id"
    WHERE t."id" = NEW."attempt_id";
  IF NEW."resolved_by_id" IS NOT NULL AND NEW."resolved_by_id" IS DISTINCT FROM activity_row."teacher_id" THEN
    RAISE EXCEPTION 'only the teacher of the activity resolves hold %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."resolution" = 'RETURNED' THEN
    ends_at := least(
      activity_row."started_at" + make_interval(mins => activity_row."duration_minutes"::int),
      activity_row."deadline",
      activity_row."closed_at",
      activity_row."cancelled_at"
    );
    IF activity_row."status" <> 'ACTIVE' OR now() >= ends_at THEN
      RAISE EXCEPTION 'hold % cannot be returned: the attempt has no time left', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- (5) The start window is gone (FR-005).
ALTER TABLE "class_activities" DROP COLUMN "start_window_minutes";
