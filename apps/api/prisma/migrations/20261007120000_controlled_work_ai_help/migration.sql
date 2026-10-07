-- 015 — Controlled works with AI help (specs/015-controlled-work-ai-help/data-model.md, research
-- F2, F4, F7, F11). A work applied to a class takes a mode (NORMAL or CONTROLLED) and an AI help
-- allowance (0 or 3), both editable only until the first student starts. A CONTROLLED attempt keeps
-- append-only, server-timed integrity events; a student's AI help requests live in
-- `work_help_requests`, with at most one pending and at most 3 delivered per attempt.
-- The new enum value is not used by any statement of this migration: PostgreSQL refuses a value
-- added in the same transaction, so the CHECKs below only name 'NORMAL'.

-- CreateEnum
CREATE TYPE "attempt_integrity_event_type" AS ENUM ('SCREEN_LEFT', 'SCREEN_RETURNED', 'FULLSCREEN_EXITED', 'FULLSCREEN_ENTERED', 'PAGE_LEAVE_ATTEMPTED', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'PASTE_BLOCKED', 'COPY_BLOCKED', 'CUT_BLOCKED', 'DROP_BLOCKED', 'TYPING_LIMIT_EXCEEDED', 'FULLSCREEN_UNAVAILABLE', 'DETECTION_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "work_help_status" AS ENUM ('REQUESTED', 'DELIVERED', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED');

-- AlterEnum
ALTER TYPE "activity_execution_mode" ADD VALUE 'CONTROLLED';

-- AlterTable: existing rows are NORMAL with no AI help.
ALTER TABLE "class_activities" ADD COLUMN "ai_help_allowance" SMALLINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attempt_integrity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "client_event_id" UUID NOT NULL,
    "type" "attempt_integrity_event_type" NOT NULL,
    "question_id" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "client_occurred_at" TIMESTAMPTZ(6),
    "buffered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attempt_integrity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_help_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "status" "work_help_status" NOT NULL DEFAULT 'REQUESTED',
    "ai_execution_id" UUID,
    "message" TEXT,
    "example_code" TEXT,
    "reason_code" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_help_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_integrity_events_attempt_id_recorded_at_idx" ON "attempt_integrity_events"("attempt_id", "recorded_at");

-- CreateIndex
CREATE INDEX "attempt_integrity_events_activity_id_idx" ON "attempt_integrity_events"("activity_id");

-- CreateIndex: a resent event is a no-op (F4).
CREATE UNIQUE INDEX "attempt_integrity_events_attempt_id_client_event_id_key" ON "attempt_integrity_events"("attempt_id", "client_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_help_requests_ai_execution_id_key" ON "work_help_requests"("ai_execution_id");

-- CreateIndex
CREATE INDEX "work_help_requests_attempt_id_requested_at_idx" ON "work_help_requests"("attempt_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_help_requests_attempt_id_idempotency_key_key" ON "work_help_requests"("attempt_id", "idempotency_key");

-- CreateIndex: one pending request per attempt (F11).
CREATE UNIQUE INDEX "work_help_requests_one_pending" ON "work_help_requests"("attempt_id") WHERE "status" = 'REQUESTED';

-- AddForeignKey: the event is of an attempt of that activity and of its student…
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_attempt_id_activity_id_student_us_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: …and, when it names one, of a question of that activity.
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_question_id_activity_id_fkey" FOREIGN KEY ("question_id", "activity_id") REFERENCES "class_activity_questions"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_attempt_id_activity_id_student_user_id_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_question_id_activity_id_fkey" FOREIGN KEY ("question_id", "activity_id") REFERENCES "class_activity_questions"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_ai_execution_id_fkey" FOREIGN KEY ("ai_execution_id") REFERENCES "ai_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F2: the mode and the AI help are options of a work (ASSIGNMENT); an EXERCISE stays NORMAL with none.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_execution_mode_chk"
  CHECK ("type" = 'ASSIGNMENT' OR "execution_mode" = 'NORMAL');
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_ai_help_allowance_chk"
  CHECK ("ai_help_allowance" IN (0, 3) AND ("type" = 'ASSIGNMENT' OR "ai_help_allowance" = 0));

-- F4: the browser's time only for an event sent from the offline buffer; a question only for the
-- clipboard and typing events, and always for the server's typing refusal (F7).
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_buffered_chk"
  CHECK (("client_occurred_at" IS NOT NULL) = "buffered");
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_question_chk"
  CHECK (
    ("question_id" IS NULL OR "type" IN ('PASTE_BLOCKED', 'COPY_BLOCKED', 'CUT_BLOCKED', 'DROP_BLOCKED', 'TYPING_LIMIT_EXCEEDED'))
    AND ("type" <> 'TYPING_LIMIT_EXCEEDED' OR "question_id" IS NOT NULL)
  );

-- F11: sizes, and the fields each status carries.
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_size_chk"
  CHECK (
    char_length("question") BETWEEN 1 AND 500
    AND ("message" IS NULL OR char_length("message") BETWEEN 1 AND 2000)
    AND ("example_code" IS NULL OR char_length("example_code") BETWEEN 1 AND 1500)
    AND ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]{0,63}$')
  );
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_status_chk"
  CHECK (
    CASE "status"
      WHEN 'REQUESTED' THEN "message" IS NULL AND "example_code" IS NULL AND "reason_code" IS NULL AND "resolved_at" IS NULL
      WHEN 'DELIVERED' THEN "message" IS NOT NULL AND "reason_code" IS NULL AND "resolved_at" IS NOT NULL
      WHEN 'OUT_OF_SCOPE' THEN "message" IS NOT NULL AND "example_code" IS NULL AND "reason_code" IS NULL AND "resolved_at" IS NOT NULL
      WHEN 'BLOCKED' THEN "message" IS NULL AND "example_code" IS NULL AND "resolved_at" IS NOT NULL
        AND "reason_code" IS NOT NULL AND "reason_code" IN ('MC_ALTERNATIVE_REFERENCED', 'EXPECTED_ANSWER_OVERLAP', 'SOLUTION_OVERLAP')
      WHEN 'FAILED' THEN "message" IS NULL AND "example_code" IS NULL AND "reason_code" IS NOT NULL AND "resolved_at" IS NOT NULL
    END
  );

-- F9: a proposal settled by its domain's rule (`proposal.settle: "ON_MATERIALIZE"`) is APPROVED or
-- REJECTED by nobody: its decider stays NULL (actor SYSTEM in the audit). A partial approval and the
-- statuses nobody decided keep the 006 rule. Replaces "ai_proposals_decided_by_chk".
ALTER TABLE "ai_proposals" DROP CONSTRAINT "ai_proposals_decided_by_chk";
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_decided_by_chk" CHECK (
  ("decided_by_user_id" IS NULL OR "status" IN ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'))
  AND ("status" <> 'PARTIALLY_APPROVED' OR "decided_by_user_id" IS NOT NULL));

-- The class, type, grade and source of an activity never change; since 015 the mode and the AI help
-- change only while no student has started it (F2). Replaces the 012 function; its trigger stays.
CREATE OR REPLACE FUNCTION "class_activities_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."teacher_id" IS DISTINCT FROM OLD."teacher_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."total_grade" IS DISTINCT FROM OLD."total_grade"
     OR NEW."question_count" IS DISTINCT FROM OLD."question_count"
     OR NEW."source_work_id" IS DISTINCT FROM OLD."source_work_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key" THEN
    RAISE EXCEPTION 'the class, type, grade and source of activity % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."execution_mode" IS DISTINCT FROM OLD."execution_mode"
      OR NEW."ai_help_allowance" IS DISTINCT FROM OLD."ai_help_allowance")
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the mode and AI help of activity % are fixed once a student started', OLD."id"
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

-- F4: integrity events are facts, written only for an open attempt of a CONTROLLED activity and
-- never changed or deleted. Tests truncate with session_replication_role = replica, which skips them.
CREATE FUNCTION "attempt_integrity_events_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mode "activity_execution_mode";
  attempt_status "activity_attempt_status";
BEGIN
  SELECT a."execution_mode", t."status" INTO mode, attempt_status
    FROM "activity_attempts" t JOIN "class_activities" a ON a."id" = t."activity_id"
    WHERE t."id" = NEW."attempt_id";
  IF mode IS DISTINCT FROM 'CONTROLLED' THEN
    RAISE EXCEPTION 'attempt % is not of a controlled activity', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no event is recorded', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_integrity_events_insert"
  BEFORE INSERT ON "attempt_integrity_events"
  FOR EACH ROW EXECUTE FUNCTION "attempt_integrity_events_insert"();

CREATE FUNCTION "attempt_integrity_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'attempt_integrity_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "attempt_integrity_events_append_only"
  BEFORE UPDATE OR DELETE ON "attempt_integrity_events"
  FOR EACH ROW EXECUTE FUNCTION "attempt_integrity_events_append_only"();

-- F11: a request goes from REQUESTED to one terminal status once and is then final; what was asked,
-- by whom and when never changes, and a request is never deleted.
CREATE FUNCTION "work_help_requests_transition"() RETURNS trigger
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
     OR NEW."ai_execution_id" IS DISTINCT FROM OLD."ai_execution_id"
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

CREATE TRIGGER "work_help_requests_transition"
  BEFORE UPDATE OR DELETE ON "work_help_requests"
  FOR EACH ROW EXECUTE FUNCTION "work_help_requests_transition"();

-- F11: at commit, the activity of a request allows AI help (allowance 3) and its attempt has at most
-- that many DELIVERED. One pending request per attempt (the partial UNIQUE above) serializes them.
CREATE FUNCTION "work_help_requests_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowance SMALLINT;
  delivered INTEGER;
BEGIN
  SELECT "ai_help_allowance" INTO allowance FROM "class_activities" WHERE "id" = NEW."activity_id";
  IF allowance IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'activity % does not allow AI help', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO delivered FROM "work_help_requests"
    WHERE "attempt_id" = NEW."attempt_id" AND "status" = 'DELIVERED';
  IF delivered > allowance THEN
    RAISE EXCEPTION 'attempt % has % delivered helps, more than %', NEW."attempt_id", delivered, allowance
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "work_help_requests_valid"
  AFTER INSERT OR UPDATE ON "work_help_requests"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_help_requests_valid"();

-- Reference data: permission of specs/015-controlled-work-ai-help/contracts/permissions.md. Idempotent.
INSERT INTO "permissions" ("key", "description") VALUES
  ('ia.ajuda.pedir', 'Pedir e ver as ajudas da IA nos próprios trabalhos')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('STUDENT', 'ia.ajuda.pedir')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
