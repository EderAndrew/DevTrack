-- 015 research F11: a help request is created before its AI execution, in the same transaction (the
-- foundation checks that the execution's resource exists and is the student's), so its
-- `ai_execution_id` is written once, from NULL, right after the execution. Everything else stays as
-- in 20261007120000_controlled_work_ai_help: what was asked, by whom and when never changes, a
-- request goes from REQUESTED to one terminal status once and is never deleted.
CREATE OR REPLACE FUNCTION "work_help_requests_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'help request % cannot be deleted', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."question_id" IS DISTINCT FROM OLD."question_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."question" IS DISTINCT FROM OLD."question"
     OR (OLD."ai_execution_id" IS NOT NULL AND NEW."ai_execution_id" IS DISTINCT FROM OLD."ai_execution_id")
     OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at" THEN
    RAISE EXCEPTION 'the request of help % is immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'REQUESTED' THEN
    RAISE EXCEPTION 'help request % is % and final', OLD."id", OLD."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
