-- 018 — Controlled exams (specs/018-controlled-exams/data-model.md, research T2–T9). The teacher's
-- Banco de Provas (mirroring the 011 work bank), the EXAM activity (always CONTROLLED, without AI
-- help, PRESENT_ONLY, timed per student), the exam's submission end reasons, the INACTIVITY event,
-- the counted occurrences and the holds opened by the 4th one, and the 016 defense triggers extended
-- to the holds. Rules Prisma can't express are written by hand after the generated DDL.

-- CreateEnum
CREATE TYPE "exam_status" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "exam_origin" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "exam_end_reason" AS ENUM ('STUDENT_SUBMITTED', 'TIME_EXPIRED', 'ACTIVITY_CLOSED', 'ENDED_BY_WARNINGS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "exam_occurrence_kind" AS ENUM ('SCREEN_LEFT', 'FULLSCREEN_EXITED', 'CLIPBOARD', 'INACTIVITY');

-- CreateEnum
CREATE TYPE "exam_hold_resolution" AS ENUM ('CANCEL_CONFIRMED', 'RETURNED', 'NOT_CANCELLED');

-- AlterEnum
ALTER TYPE "attempt_integrity_event_type" ADD VALUE 'INACTIVITY';

-- AlterEnum
ALTER TYPE "class_activity_type" ADD VALUE 'EXAM';

-- AlterTable
ALTER TABLE "activity_submissions" ADD COLUMN     "cancelled_by_id" UUID,
ADD COLUMN     "end_reason" "exam_end_reason";

-- AlterTable
ALTER TABLE "attempt_integrity_events" ADD COLUMN     "idle_seconds" SMALLINT;

-- AlterTable
ALTER TABLE "class_activities" ADD COLUMN     "duration_minutes" SMALLINT,
ADD COLUMN     "inactivity_limit_seconds" SMALLINT,
ADD COLUMN     "source_exam_id" UUID,
ADD COLUMN     "start_window_minutes" SMALLINT;

-- AlterTable
ALTER TABLE "class_activity_questions" ADD COLUMN     "exam_difficulty" "work_difficulty";

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "title_search_key" TEXT NOT NULL,
    "description" TEXT,
    "total_grade" DECIMAL(5,2) NOT NULL,
    "question_count" INTEGER NOT NULL,
    "origin" "exam_origin" NOT NULL,
    "status" "exam_status" NOT NULL DEFAULT 'DRAFT',
    "archived_from_status" "exam_status",
    "generation_request_id" UUID,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "human_edited" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_topics" (
    "exam_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "exam_topics_pkey" PRIMARY KEY ("exam_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "work_question_type" NOT NULL,
    "grading_strategy" "work_grading_strategy" NOT NULL,
    "statement" TEXT NOT NULL,
    "statement_search_key" TEXT NOT NULL,
    "value" DECIMAL(5,2) NOT NULL,
    "difficulty" "work_difficulty",
    "explanation" TEXT,
    "expected_answer" TEXT,
    "rubric" TEXT,
    "instructions" TEXT,
    "starter_code" TEXT,
    "expected_solution" TEXT,
    "language_id" UUID,
    "is_trick_question" BOOLEAN NOT NULL DEFAULT false,
    "generation_item_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_alternatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "exam_question_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_test_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "visibility" "work_test_case_visibility" NOT NULL,

    CONSTRAINT "exam_question_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_topics" (
    "question_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,

    CONSTRAINT "exam_question_topics_pkey" PRIMARY KEY ("question_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "exam_generation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "work_difficulty" NOT NULL,
    "total_grade" DECIMAL(5,2) NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "open_answer_quantity" INTEGER NOT NULL,
    "multiple_choice_quantity" INTEGER NOT NULL,
    "code_quantity" INTEGER NOT NULL,
    "trick_question_quantity" INTEGER NOT NULL,
    "language_id" UUID,
    "ai_execution_id" UUID,
    "idempotency_key" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_generation_request_topics" (
    "request_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "exam_generation_request_topics_pkey" PRIMARY KEY ("request_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "exam_occurrences" (
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "kind" "exam_occurrence_kind" NOT NULL,
    "first_event_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_occurrences_pkey" PRIMARY KEY ("attempt_id","ordinal")
);

-- CreateTable
CREATE TABLE "exam_attempt_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "occurrence_ordinal" SMALLINT NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "resolution" "exam_hold_resolution",
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,

    CONSTRAINT "exam_attempt_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_generation_request_id_key" ON "exams"("generation_request_id");

-- CreateIndex
CREATE INDEX "exams_teacher_id_status_updated_at_id_idx" ON "exams"("teacher_id", "status", "updated_at" DESC, "id");

-- CreateIndex
CREATE INDEX "exams_teacher_id_subject_id_idx" ON "exams"("teacher_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_id_syllabus_revision_id_key" ON "exams"("id", "syllabus_revision_id");

-- CreateIndex
CREATE INDEX "exam_topics_syllabus_item_id_idx" ON "exam_topics"("syllabus_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_topics_exam_id_position_key" ON "exam_topics"("exam_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_id_exam_id_key" ON "exam_questions"("id", "exam_id");

-- CreateIndex
-- Deferrable, so a reorder can swap positions within the transaction (as 011 research W16).
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_position_key" UNIQUE ("exam_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_id_generation_item_id_key" ON "exam_questions"("exam_id", "generation_item_id");

-- CreateIndex
ALTER TABLE "exam_question_alternatives" ADD CONSTRAINT "exam_question_alternatives_question_id_position_key" UNIQUE ("question_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
ALTER TABLE "exam_question_test_cases" ADD CONSTRAINT "exam_question_test_cases_question_id_position_key" UNIQUE ("question_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE UNIQUE INDEX "exam_generation_requests_ai_execution_id_key" ON "exam_generation_requests"("ai_execution_id");

-- CreateIndex
CREATE INDEX "exam_generation_requests_teacher_id_created_at_id_idx" ON "exam_generation_requests"("teacher_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_generation_requests_id_syllabus_revision_id_key" ON "exam_generation_requests"("id", "syllabus_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_generation_requests_teacher_id_idempotency_key_key" ON "exam_generation_requests"("teacher_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "exam_generation_request_topics_request_id_position_key" ON "exam_generation_request_topics"("request_id", "position");

-- CreateIndex
CREATE INDEX "exam_occurrences_activity_id_idx" ON "exam_occurrences"("activity_id");

-- CreateIndex
CREATE INDEX "exam_attempt_holds_activity_id_resolution_idx" ON "exam_attempt_holds"("activity_id", "resolution");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_integrity_events_id_attempt_id_key" ON "attempt_integrity_events"("id", "attempt_id");

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_source_exam_id_fkey" FOREIGN KEY ("source_exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_generation_request_id_fkey" FOREIGN KEY ("generation_request_id") REFERENCES "exam_generation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_topics" ADD CONSTRAINT "exam_topics_exam_id_syllabus_revision_id_fkey" FOREIGN KEY ("exam_id", "syllabus_revision_id") REFERENCES "exams"("id", "syllabus_revision_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_topics" ADD CONSTRAINT "exam_topics_syllabus_item_id_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_item_id", "syllabus_revision_id") REFERENCES "syllabus_items"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_alternatives" ADD CONSTRAINT "exam_question_alternatives_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_test_cases" ADD CONSTRAINT "exam_question_test_cases_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_topics" ADD CONSTRAINT "exam_question_topics_question_id_exam_id_fkey" FOREIGN KEY ("question_id", "exam_id") REFERENCES "exam_questions"("id", "exam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_topics" ADD CONSTRAINT "exam_question_topics_exam_id_syllabus_item_id_fkey" FOREIGN KEY ("exam_id", "syllabus_item_id") REFERENCES "exam_topics"("exam_id", "syllabus_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_ai_execution_id_fkey" FOREIGN KEY ("ai_execution_id") REFERENCES "ai_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_request_topics" ADD CONSTRAINT "exam_generation_request_topics_request_id_syllabus_revisio_fkey" FOREIGN KEY ("request_id", "syllabus_revision_id") REFERENCES "exam_generation_requests"("id", "syllabus_revision_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_generation_request_topics" ADD CONSTRAINT "exam_generation_request_topics_syllabus_item_id_syllabus_r_fkey" FOREIGN KEY ("syllabus_item_id", "syllabus_revision_id") REFERENCES "syllabus_items"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_occurrences" ADD CONSTRAINT "exam_occurrences_attempt_id_activity_id_student_user_id_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_occurrences" ADD CONSTRAINT "exam_occurrences_first_event_id_attempt_id_fkey" FOREIGN KEY ("first_event_id", "attempt_id") REFERENCES "attempt_integrity_events"("id", "attempt_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_holds" ADD CONSTRAINT "exam_attempt_holds_attempt_id_activity_id_student_user_id_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_holds" ADD CONSTRAINT "exam_attempt_holds_attempt_id_occurrence_ordinal_fkey" FOREIGN KEY ("attempt_id", "occurrence_ordinal") REFERENCES "exam_occurrences"("attempt_id", "ordinal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_holds" ADD CONSTRAINT "exam_attempt_holds_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Rules Prisma can't express (data-model.md) ─────────────────────────────────────────────────
-- `class_activity_type` gains EXAM and `attempt_integrity_event_type` gains INACTIVITY above; a value
-- added to an existing enum can't be used in the transaction that adds it, so the CHECKs and index
-- predicates below compare those two columns as text. The trigger functions run later and compare
-- them as usual.

-- ── Banco de Provas (research T2): the 011 rules, with 1–20 questions and topics required ──────

-- One correct alternative per question; the deferred trigger below adds "exactly one".
CREATE UNIQUE INDEX "exam_question_alternatives_one_correct_key" ON "exam_question_alternatives"("question_id") WHERE "is_correct";

ALTER TABLE "exams" ADD CONSTRAINT "exams_title_chk" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "exams" ADD CONSTRAINT "exams_description_chk" CHECK ("description" IS NULL OR char_length("description") <= 5000);
-- Exact grades (011 research W3): 0.01–100.00 and at least 0.01 per question.
ALTER TABLE "exams" ADD CONSTRAINT "exams_total_grade_chk"
  CHECK ("total_grade" BETWEEN 0.01 AND 100.00 AND "total_grade" * 100 >= "question_count");
ALTER TABLE "exams" ADD CONSTRAINT "exams_question_count_chk" CHECK ("question_count" BETWEEN 1 AND 20);
-- The restore target exists exactly while archived, and is never ARCHIVED itself.
ALTER TABLE "exams" ADD CONSTRAINT "exams_archived_chk"
  CHECK (("status" = 'ARCHIVED') = ("archived_from_status" IS NOT NULL) AND "archived_from_status" IS DISTINCT FROM 'ARCHIVED');
-- An AI_GENERATED exam always has its request; a MANUAL one never has one.
ALTER TABLE "exams" ADD CONSTRAINT "exams_origin_chk" CHECK (("origin" = 'AI_GENERATED') = ("generation_request_id" IS NOT NULL));
ALTER TABLE "exams" ADD CONSTRAINT "exams_reviewed_chk" CHECK (("reviewed_by_id" IS NULL) = ("reviewed_at" IS NULL));
-- An AI draft reaches the bank only through a person's review (FR-006).
ALTER TABLE "exams" ADD CONSTRAINT "exams_ai_approved_chk"
  CHECK (NOT ("origin" = 'AI_GENERATED' AND "status" = 'APPROVED') OR ("human_reviewed" AND "reviewed_by_id" IS NOT NULL));
ALTER TABLE "exams" ADD CONSTRAINT "exams_version_chk" CHECK ("version" >= 1);

ALTER TABLE "exam_topics" ADD CONSTRAINT "exam_topics_position_chk" CHECK ("position" >= 0);

ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_position_chk" CHECK ("position" >= 0);
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_statement_chk" CHECK (char_length("statement") BETWEEN 1 AND 10000);
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_explanation_chk"
  CHECK ("explanation" IS NULL OR char_length("explanation") <= 10000);
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_value_chk" CHECK ("value" >= 0.01);
-- The grading strategy is the type's (011 research W7).
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_grading_strategy_chk"
  CHECK (
    ("type" = 'MULTIPLE_CHOICE') = ("grading_strategy" = 'EXACT_MATCH')
    AND ("type" = 'CODE') = ("grading_strategy" = 'TEST_CASES')
    AND ("type" = 'OPEN_ANSWER') = ("grading_strategy" = 'AI_REVIEW')
  );
-- The fields of each type (011 FR-004–FR-006), so every question carries its answer key.
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_open_answer_chk"
  CHECK (("type" = 'OPEN_ANSWER') = ("expected_answer" IS NOT NULL) AND ("rubric" IS NULL OR "type" = 'OPEN_ANSWER'));
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_code_chk"
  CHECK (
    ("type" = 'CODE') = ("expected_solution" IS NOT NULL)
    AND ("type" = 'CODE') = ("language_id" IS NOT NULL)
    AND ("instructions" IS NULL OR "type" = 'CODE')
    AND ("starter_code" IS NULL OR "type" = 'CODE')
  );
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_trick_question_chk"
  CHECK (NOT "is_trick_question" OR "type" = 'MULTIPLE_CHOICE');

ALTER TABLE "exam_question_alternatives" ADD CONSTRAINT "exam_question_alternatives_position_chk" CHECK ("position" >= 0);
ALTER TABLE "exam_question_alternatives" ADD CONSTRAINT "exam_question_alternatives_text_chk"
  CHECK (char_length("text") BETWEEN 1 AND 2000);

ALTER TABLE "exam_question_test_cases" ADD CONSTRAINT "exam_question_test_cases_position_chk" CHECK ("position" >= 0);
ALTER TABLE "exam_question_test_cases" ADD CONSTRAINT "exam_question_test_cases_text_chk"
  CHECK (char_length("input") <= 10000 AND char_length("expected_output") <= 10000);

-- A generation request (research T14).
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_title_chk" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_total_grade_chk"
  CHECK ("total_grade" BETWEEN 0.01 AND 100.00 AND "total_grade" * 100 >= "requested_quantity");
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_quantity_chk"
  CHECK (
    "requested_quantity" BETWEEN 1 AND 20
    AND "open_answer_quantity" >= 0 AND "multiple_choice_quantity" >= 0 AND "code_quantity" >= 0
    AND "open_answer_quantity" + "multiple_choice_quantity" + "code_quantity" = "requested_quantity"
  );
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_trick_chk"
  CHECK ("trick_question_quantity" BETWEEN 0 AND 3 AND "trick_question_quantity" <= "multiple_choice_quantity");
-- The language comes from the revision and matters only for code.
ALTER TABLE "exam_generation_requests" ADD CONSTRAINT "exam_generation_requests_language_chk"
  CHECK (("code_quantity" > 0) = ("language_id" IS NOT NULL));

ALTER TABLE "exam_generation_request_topics" ADD CONSTRAINT "exam_generation_request_topics_position_chk" CHECK ("position" >= 0);

-- An exam's origin and a question's type never change, even when edited. Tests truncate with
-- session_replication_role = replica, which skips these row triggers.
CREATE FUNCTION "exams_origin_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" THEN
    RAISE EXCEPTION 'exam origin is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exams_origin_immutable"
  BEFORE UPDATE ON "exams"
  FOR EACH ROW EXECUTE FUNCTION "exams_origin_immutable"();

CREATE FUNCTION "exam_questions_type_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type" OR NEW."exam_id" IS DISTINCT FROM OLD."exam_id" THEN
    RAISE EXCEPTION 'exam question type and exam are immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_questions_type_immutable"
  BEFORE UPDATE ON "exam_questions"
  FOR EACH ROW EXECUTE FUNCTION "exam_questions_type_immutable"();

-- At commit, an exam has exactly `question_count` questions at positions 0..question_count-1 whose
-- values add up to `total_grade` (FR-003) and 1–20 topics (FR-002); an APPROVED exam has a difficulty
-- and at least one topic on every question (FR-004). Deferred and fired on the four tables, so an exam
-- and its parts can be written in any order within the transaction.
CREATE FUNCTION "exams_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  exam_row RECORD;
  total INTEGER;
  max_position INTEGER;
  value_sum NUMERIC;
  topic_count INTEGER;
  incomplete INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'exams' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."exam_id";
  ELSE
    target := NEW."exam_id";
  END IF;

  SELECT "question_count", "total_grade", "status" INTO exam_row FROM "exams" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), max("position"), coalesce(sum("value"), 0)
    INTO total, max_position, value_sum
    FROM "exam_questions" WHERE "exam_id" = target;
  IF total <> exam_row."question_count" OR max_position IS DISTINCT FROM total - 1 THEN
    RAISE EXCEPTION 'exam % needs % questions at contiguous positions, has %', target, exam_row."question_count", total
      USING ERRCODE = 'check_violation';
  END IF;
  IF value_sum <> exam_row."total_grade" THEN
    RAISE EXCEPTION 'the question values of exam % add up to %, not %', target, value_sum, exam_row."total_grade"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO topic_count FROM "exam_topics" WHERE "exam_id" = target;
  IF topic_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'exam % needs 1 to 20 topics, has %', target, topic_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF exam_row."status" = 'APPROVED' THEN
    SELECT count(*) INTO incomplete FROM "exam_questions" q
      WHERE q."exam_id" = target
        AND (q."difficulty" IS NULL OR NOT EXISTS (SELECT 1 FROM "exam_question_topics" t WHERE t."question_id" = q."id"));
    IF incomplete > 0 THEN
      RAISE EXCEPTION 'approved exam % has % questions without a difficulty or a topic', target, incomplete
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exams_valid"
  AFTER INSERT OR UPDATE ON "exams"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exams_valid"();

CREATE CONSTRAINT TRIGGER "exam_questions_exams_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exams_valid"();

CREATE CONSTRAINT TRIGGER "exam_topics_exams_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exams_valid"();

CREATE CONSTRAINT TRIGGER "exam_question_topics_exams_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_question_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exams_valid"();

-- At commit, a MULTIPLE_CHOICE question has 3–5 alternatives, exactly one correct and no two texts
-- equal after trimming, collapsing spaces and lowercasing; no other type has alternatives. A CODE
-- question has at most 20 test cases; no other type has any.
CREATE FUNCTION "exam_questions_parts_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  question_kind "work_question_type";
  alternative_total INTEGER;
  correct INTEGER;
  distinct_texts INTEGER;
  test_case_total INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'exam_questions' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."question_id";
  ELSE
    target := NEW."question_id";
  END IF;

  SELECT "type" INTO question_kind FROM "exam_questions" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL; -- the question was deleted with its parts
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE "is_correct"),
         count(DISTINCT lower(regexp_replace(btrim("text"), '\s+', ' ', 'g')))
    INTO alternative_total, correct, distinct_texts
    FROM "exam_question_alternatives" WHERE "question_id" = target;
  SELECT count(*) INTO test_case_total FROM "exam_question_test_cases" WHERE "question_id" = target;

  IF question_kind = 'MULTIPLE_CHOICE' THEN
    IF alternative_total NOT BETWEEN 3 AND 5 OR correct <> 1 OR distinct_texts <> alternative_total THEN
      RAISE EXCEPTION 'multiple choice question % needs 3 to 5 distinct alternatives with exactly one correct', target
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF alternative_total > 0 THEN
    RAISE EXCEPTION 'question % of type % cannot have alternatives', target, question_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF question_kind = 'CODE' THEN
    IF test_case_total > 20 THEN
      RAISE EXCEPTION 'code question % has more than 20 test cases', target
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF test_case_total > 0 THEN
    RAISE EXCEPTION 'question % of type % cannot have test cases', target, question_kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exam_questions_parts_valid"
  AFTER INSERT ON "exam_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "exam_question_alternatives_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_question_alternatives"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "exam_question_test_cases_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_question_test_cases"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_questions_parts_valid"();

-- At commit, a question links at most 3 topics (of its own exam, by the composite FKs).
CREATE FUNCTION "exam_question_topics_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  topic_count INTEGER;
BEGIN
  SELECT count(*) INTO topic_count FROM "exam_question_topics" WHERE "question_id" = NEW."question_id";
  IF topic_count > 3 THEN
    RAISE EXCEPTION 'question % links more than 3 topics', NEW."question_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exam_question_topics_valid"
  AFTER INSERT OR UPDATE ON "exam_question_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_question_topics_valid"();

-- At commit, a generation request has 1–10 topics and at most 3 per requested question.
CREATE FUNCTION "exam_generation_requests_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  quantity INTEGER;
  topic_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'exam_generation_requests' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."request_id";
  ELSE
    target := NEW."request_id";
  END IF;

  SELECT "requested_quantity" INTO quantity FROM "exam_generation_requests" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO topic_count FROM "exam_generation_request_topics" WHERE "request_id" = target;
  IF topic_count NOT BETWEEN 1 AND 10 OR topic_count > 3 * quantity THEN
    RAISE EXCEPTION 'generation request % needs 1 to 10 topics and at most 3 per question, has %', target, topic_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exam_generation_requests_valid"
  AFTER INSERT OR UPDATE ON "exam_generation_requests"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_generation_requests_valid"();

CREATE CONSTRAINT TRIGGER "exam_generation_request_topics_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_generation_request_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exam_generation_requests_valid"();

-- ── The EXAM activity (research T3) ──────────────────────────────────────────────────────────

-- The source: a work (ASSIGNMENT) or an exam (EXAM), each with its subject; exercises carry none.
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_source_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_source_chk"
  CHECK (
    ("type" = 'ASSIGNMENT') = ("source_work_id" IS NOT NULL)
    AND ("type"::text = 'EXAM') = ("source_exam_id" IS NOT NULL)
    AND ("type" <> 'EXERCISE') = ("source_subject_id" IS NOT NULL)
  );
-- A grade for ASSIGNMENT and EXAM; a deadline and a late policy only for ASSIGNMENT (an exam's time
-- is each student's duration, T4); a result release never for EXERCISE.
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_type_fields_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_type_fields_chk"
  CHECK (
    ("type" <> 'EXERCISE') = ("total_grade" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT') = ("deadline" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT') = ("late_policy" IS NOT NULL)
    AND ("type" <> 'EXERCISE' OR "result_released_at" IS NULL)
  );
-- CONTROLLED for a work or an exam, and always for an exam (FR-010).
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_execution_mode_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_execution_mode_chk"
  CHECK (
    ("type" IN ('ASSIGNMENT') OR "type"::text = 'EXAM' OR "execution_mode" = 'NORMAL')
    AND ("type"::text <> 'EXAM' OR "execution_mode" = 'CONTROLLED')
  );
-- PRESENT_ONLY for a work or an exam, and always for an exam (FR-009). The AI help stays 0 outside
-- ASSIGNMENT (`class_activities_ai_help_allowance_chk`, unchanged).
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_release_mode_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_release_mode_chk"
  CHECK (
    ("type" = 'ASSIGNMENT' OR "type"::text = 'EXAM' OR "release_mode" = 'ALL_ENROLLED')
    AND ("type"::text <> 'EXAM' OR "release_mode" = 'PRESENT_ONLY')
  );
-- 1–10 questions, 1–20 for an exam (FR-001).
ALTER TABLE "class_activities" DROP CONSTRAINT "class_activities_question_count_chk";
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_question_count_chk"
  CHECK ("question_count" BETWEEN 1 AND 10 OR ("type"::text = 'EXAM' AND "question_count" BETWEEN 1 AND 20));
-- An exam's duration, inactivity limit and start window, set iff EXAM (FR-007).
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_exam_chk"
  CHECK (
    ("type"::text = 'EXAM') = ("duration_minutes" IS NOT NULL)
    AND ("type"::text = 'EXAM') = ("inactivity_limit_seconds" IS NOT NULL)
    AND ("type"::text = 'EXAM') = ("start_window_minutes" IS NOT NULL)
    AND ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 120)
    AND ("inactivity_limit_seconds" IS NULL OR "inactivity_limit_seconds" BETWEEN 30 AND 60)
    AND ("start_window_minutes" IS NULL OR "start_window_minutes" BETWEEN 0 AND 60)
  );

ALTER TABLE "class_activity_questions" DROP CONSTRAINT "class_activity_questions_position_chk";
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_position_chk" CHECK ("position" BETWEEN 0 AND 19);

-- 012 + 018: the exam's source and timing never change either.
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
     OR NEW."start_window_minutes" IS DISTINCT FROM OLD."start_window_minutes"
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
  IF OLD."status" = 'CANCELLED' AND NEW."status" <> 'CANCELLED'
     OR OLD."status" = 'CLOSED' AND NEW."status" = 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % cannot go from % to %', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 012 + 013 + 018: an ASSIGNMENT's and an EXAM's questions carry a value adding up to the grade; an
-- EXAM's also the question's difficulty (`exam_difficulty`); an EXERCISE's an exercise, its difficulty
-- and its points.
CREATE OR REPLACE FUNCTION "class_activities_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  activity_row RECORD;
  total INTEGER;
  max_position INTEGER;
  value_sum NUMERIC;
  misplaced INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'class_activities' THEN
    target := NEW."id";
  ELSE
    target := NEW."activity_id";
  END IF;

  SELECT "type", "question_count", "total_grade" INTO activity_row FROM "class_activities" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), max("position"), coalesce(sum("value"), 0)
    INTO total, max_position, value_sum
    FROM "class_activity_questions" WHERE "activity_id" = target;
  IF total <> activity_row."question_count" OR max_position IS DISTINCT FROM total - 1 THEN
    RAISE EXCEPTION 'activity % needs % questions at contiguous positions, has %', target, activity_row."question_count", total
      USING ERRCODE = 'check_violation';
  END IF;

  IF activity_row."type" = 'ASSIGNMENT' OR activity_row."type" = 'EXAM' THEN
    SELECT count(*) INTO misplaced FROM "class_activity_questions"
      WHERE "activity_id" = target
        AND ("value" IS NULL OR "difficulty" IS NOT NULL OR "points" IS NOT NULL OR "source_exercise_id" IS NOT NULL
             OR ("exam_difficulty" IS NULL) = (activity_row."type" = 'EXAM'));
    IF misplaced > 0 THEN
      RAISE EXCEPTION 'the questions of % % need a value and no difficulty, points or exercise, with an exam difficulty iff EXAM',
        lower(activity_row."type"::text), target
        USING ERRCODE = 'check_violation';
    END IF;
    IF value_sum <> activity_row."total_grade" THEN
      RAISE EXCEPTION 'the question values of activity % add up to %, not %', target, value_sum, activity_row."total_grade"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT count(*) INTO misplaced FROM "class_activity_questions"
      WHERE "activity_id" = target
        AND ("value" IS NOT NULL OR "difficulty" IS NULL OR "points" IS NULL OR "source_exercise_id" IS NULL
             OR "exam_difficulty" IS NOT NULL);
    IF misplaced > 0 THEN
      RAISE EXCEPTION 'the questions of exercise activity % need an exercise, its difficulty and points, and no value', target
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Submissions of an exam (research T5, T9) ───────────────────────────────────────────────

ALTER TABLE "activity_submissions" DROP CONSTRAINT "activity_submissions_blank_count_chk";
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_blank_count_chk" CHECK ("blank_count" BETWEEN 0 AND 20);
-- The teacher's confirmed cancellation: who confirmed it, grade 0, complete (FR-021).
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_cancelled_chk"
  CHECK (
    ("cancelled_by_id" IS NOT NULL) = ("end_reason" IS NOT DISTINCT FROM 'CANCELLED')
    AND ("end_reason" IS DISTINCT FROM 'CANCELLED' OR ("grade" = 0 AND NOT "grade_partial"))
  );
-- An exam ended by the time, the close or the teacher's decision is never late (T5, T9).
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_end_reason_chk"
  CHECK ("end_reason" IS NULL OR "end_reason" = 'STUDENT_SUBMITTED' OR NOT "late");

-- `end_reason` is set iff the activity is an EXAM.
CREATE FUNCTION "activity_submissions_end_reason"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_type "class_activity_type";
BEGIN
  SELECT "type" INTO activity_type FROM "class_activities" WHERE "id" = NEW."activity_id";
  IF (activity_type = 'EXAM') <> (NEW."end_reason" IS NOT NULL) THEN
    RAISE EXCEPTION 'a submission of activity % has an end reason iff the activity is an exam', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_submissions_end_reason"
  BEFORE INSERT ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "activity_submissions_end_reason"();

-- 012 + 018: the end reason and who cancelled are submitted facts too.
CREATE OR REPLACE FUNCTION "activity_submissions_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submission % cannot be deleted', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
     OR NEW."late" IS DISTINCT FROM OLD."late"
     OR NEW."blank_count" IS DISTINCT FROM OLD."blank_count"
     OR NEW."accepted_by_id" IS DISTINCT FROM OLD."accepted_by_id"
     OR NEW."end_reason" IS DISTINCT FROM OLD."end_reason"
     OR NEW."cancelled_by_id" IS DISTINCT FROM OLD."cancelled_by_id" THEN
    RAISE EXCEPTION 'the submitted facts of submission % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- At commit, a CANCELLED submission has every question DECIDED with 0 by the teacher who cancelled
-- (FR-021): the zero is the teacher's decision, question by question.
CREATE FUNCTION "activity_submissions_cancelled_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  submission_row RECORD;
  question_total INTEGER;
  decided INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'activity_submissions' THEN
    target := NEW."id";
  ELSE
    target := NEW."submission_id";
  END IF;
  SELECT s."end_reason", s."cancelled_by_id", a."question_count" INTO submission_row
    FROM "activity_submissions" s JOIN "class_activities" a ON a."id" = s."activity_id"
    WHERE s."id" = target;
  IF NOT FOUND OR submission_row."end_reason" IS DISTINCT FROM 'CANCELLED' THEN
    RETURN NULL;
  END IF;
  SELECT count(*) FILTER (WHERE "status" = 'DECIDED' AND "nature" = 'HUMAN_DECISION' AND "final_grade" = 0
                                AND "decided_by_id" = submission_row."cancelled_by_id"),
         count(*)
    INTO decided, question_total
    FROM "activity_question_gradings" WHERE "submission_id" = target;
  IF question_total <> submission_row."question_count" OR decided <> question_total THEN
    RAISE EXCEPTION 'cancelled submission % needs every question decided with 0 by the teacher', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "activity_submissions_cancelled_valid"
  AFTER INSERT ON "activity_submissions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "activity_submissions_cancelled_valid"();

CREATE CONSTRAINT TRIGGER "activity_question_gradings_cancelled_valid"
  AFTER INSERT OR UPDATE ON "activity_question_gradings"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "activity_submissions_cancelled_valid"();

-- ── Inactivity (research T7) ─────────────────────────────────────────────────────────────────

ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_idle_chk"
  CHECK (
    ("idle_seconds" IS NOT NULL) = ("type"::text = 'INACTIVITY')
    AND ("idle_seconds" IS NULL OR "idle_seconds" BETWEEN 30 AND 60)
  );

-- 015 + 018: an event of an IN_PROGRESS attempt of a CONTROLLED activity; INACTIVITY only in an EXAM.
CREATE OR REPLACE FUNCTION "attempt_integrity_events_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mode "activity_execution_mode";
  activity_type "class_activity_type";
  attempt_status "activity_attempt_status";
BEGIN
  SELECT a."execution_mode", a."type", t."status" INTO mode, activity_type, attempt_status
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
  IF NEW."type" = 'INACTIVITY' AND activity_type IS DISTINCT FROM 'EXAM' THEN
    RAISE EXCEPTION 'attempt % is not of an exam: no inactivity is recorded', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Occurrences (research T6) ────────────────────────────────────────────────────────────────

ALTER TABLE "exam_occurrences" ADD CONSTRAINT "exam_occurrences_ordinal_chk" CHECK ("ordinal" >= 1);

-- An occurrence of an IN_PROGRESS exam attempt with no open pause or hold, numbered max + 1, of the
-- kind of the event that opened it.
CREATE FUNCTION "exam_occurrences_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_type "class_activity_type";
  attempt_status "activity_attempt_status";
  last_ordinal INTEGER;
  event_type "attempt_integrity_event_type";
  expected_kind TEXT;
BEGIN
  SELECT a."type", t."status" INTO activity_type, attempt_status
    FROM "activity_attempts" t JOIN "class_activities" a ON a."id" = t."activity_id"
    WHERE t."id" = NEW."attempt_id";
  IF activity_type IS DISTINCT FROM 'EXAM' THEN
    RAISE EXCEPTION 'attempt % is not of an exam: no occurrence', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no occurrence', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "attempt_pauses" WHERE "attempt_id" = NEW."attempt_id" AND "released_at" IS NULL) THEN
    RAISE EXCEPTION 'attempt % is paused: no occurrence', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "exam_attempt_holds" WHERE "attempt_id" = NEW."attempt_id" AND "resolution" IS NULL) THEN
    RAISE EXCEPTION 'attempt % is on hold: no occurrence', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(max("ordinal"), 0) INTO last_ordinal FROM "exam_occurrences" WHERE "attempt_id" = NEW."attempt_id";
  IF NEW."ordinal" <> last_ordinal + 1 THEN
    RAISE EXCEPTION 'occurrence % of attempt % must be %', NEW."ordinal", NEW."attempt_id", last_ordinal + 1
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "type" INTO event_type FROM "attempt_integrity_events" WHERE "id" = NEW."first_event_id";
  expected_kind := CASE
    WHEN event_type IN ('PASTE_BLOCKED', 'COPY_BLOCKED', 'CUT_BLOCKED', 'DROP_BLOCKED') THEN 'CLIPBOARD'
    ELSE event_type::text
  END;
  IF NEW."kind"::text IS DISTINCT FROM expected_kind THEN
    RAISE EXCEPTION 'occurrence of kind % cannot start with a % event', NEW."kind", event_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_occurrences_insert"
  BEFORE INSERT ON "exam_occurrences"
  FOR EACH ROW EXECUTE FUNCTION "exam_occurrences_insert"();

CREATE FUNCTION "exam_occurrences_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exam_occurrences is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "exam_occurrences_append_only"
  BEFORE UPDATE OR DELETE ON "exam_occurrences"
  FOR EACH ROW EXECUTE FUNCTION "exam_occurrences_append_only"();

-- ── Holds (research T8, T9) ─────────────────────────────────────────────────────────────────

-- One open hold per attempt; also the lookup of every write refusal.
CREATE UNIQUE INDEX "exam_attempt_holds_one_open" ON "exam_attempt_holds"("attempt_id") WHERE "resolution" IS NULL;

ALTER TABLE "exam_attempt_holds" ADD CONSTRAINT "exam_attempt_holds_ordinal_chk" CHECK ("occurrence_ordinal" >= 4);
ALTER TABLE "exam_attempt_holds" ADD CONSTRAINT "exam_attempt_holds_resolved_chk"
  CHECK (("resolution" IS NULL) = ("resolved_at" IS NULL) AND ("resolution" IS NULL) = ("resolved_by_id" IS NULL));

-- A hold opens unresolved, on the 4th occurrence (EXAM_WARNINGS + 1) or on a later one once every
-- earlier hold of the attempt was RETURNED (FR-018).
CREATE FUNCTION "exam_attempt_holds_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous RECORD;
BEGIN
  IF NEW."resolution" IS NOT NULL THEN
    RAISE EXCEPTION 'a hold opens unresolved (attempt %)', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "occurrence_ordinal", "resolution" INTO previous FROM "exam_attempt_holds"
    WHERE "attempt_id" = NEW."attempt_id" ORDER BY "occurrence_ordinal" DESC LIMIT 1;
  IF FOUND AND (previous."resolution" IS DISTINCT FROM 'RETURNED' OR previous."occurrence_ordinal" >= NEW."occurrence_ordinal") THEN
    RAISE EXCEPTION 'attempt % gets a new hold only after a return', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_attempt_holds_insert"
  BEFORE INSERT ON "exam_attempt_holds"
  FOR EACH ROW EXECUTE FUNCTION "exam_attempt_holds_insert"();

-- A hold is resolved once, by the activity's teacher, and never deleted. RETURNED only while the
-- attempt still has time and the activity is ACTIVE (FR-022); the service checks first with the
-- injected clock, this is the backstop with the database clock and the same derivation of the end.
CREATE FUNCTION "exam_attempt_holds_transition"() RETURNS trigger
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
  SELECT a."teacher_id", a."status", a."closed_at", a."cancelled_at", a."duration_minutes", t."started_at" INTO activity_row
    FROM "class_activities" a JOIN "activity_attempts" t ON t."activity_id" = a."id"
    WHERE t."id" = NEW."attempt_id";
  IF NEW."resolved_by_id" IS NOT NULL AND NEW."resolved_by_id" IS DISTINCT FROM activity_row."teacher_id" THEN
    RAISE EXCEPTION 'only the teacher of the activity resolves hold %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."resolution" = 'RETURNED' THEN
    ends_at := least(
      activity_row."started_at" + make_interval(mins => activity_row."duration_minutes"::int),
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

CREATE TRIGGER "exam_attempt_holds_transition"
  BEFORE UPDATE OR DELETE ON "exam_attempt_holds"
  FOR EACH ROW EXECUTE FUNCTION "exam_attempt_holds_transition"();

-- ── Defense triggers (016 M6, extended) ────────────────────────────────────────────────────

-- 016 + 018: an exam's submission settled by the time, the close or the teacher's decision is
-- written although a pause is still open; the pause ends with it (by derivation, research T11).
CREATE OR REPLACE FUNCTION "attempt_paused_writes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'activity_submissions' THEN
    IF NEW."accepted_by_id" IS NOT NULL OR NEW."end_reason" IS DISTINCT FROM 'STUDENT_SUBMITTED' AND NEW."end_reason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "attempt_pauses" p JOIN "class_activities" a ON a."id" = p."activity_id"
    WHERE p."attempt_id" = NEW."attempt_id" AND p."released_at" IS NULL AND a."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'attempt % is paused: % on % refused', NEW."attempt_id", TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- While a hold is open the attempt takes no answer, submission or help (FR-019). Exempt: the
-- submission written by the teacher's decision (CANCELLED, ENDED_BY_WARNINGS). The integrity events
-- are stored as facts and only left out of the count (FR-020), so they have no such trigger.
CREATE FUNCTION "attempt_held_writes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'activity_submissions' THEN
    IF NEW."end_reason" IN ('CANCELLED', 'ENDED_BY_WARNINGS') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "exam_attempt_holds" WHERE "attempt_id" = NEW."attempt_id" AND "resolution" IS NULL) THEN
    RAISE EXCEPTION 'attempt % is on hold: % on % refused', NEW."attempt_id", TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_answers_held"
  BEFORE INSERT OR UPDATE ON "activity_answers"
  FOR EACH ROW EXECUTE FUNCTION "attempt_held_writes"();

CREATE TRIGGER "activity_submissions_held"
  BEFORE INSERT ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "attempt_held_writes"();

CREATE TRIGGER "work_help_requests_held"
  BEFORE INSERT ON "work_help_requests"
  FOR EACH ROW EXECUTE FUNCTION "attempt_held_writes"();

-- 016 + 018: the teacher can't pause a student whose exam is on hold (research T8).
CREATE OR REPLACE FUNCTION "attempt_pauses_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_mode "activity_release_mode";
  activity_status "class_activity_status";
  attempt_status "activity_attempt_status";
BEGIN
  SELECT a."release_mode", a."status", t."status" INTO activity_mode, activity_status, attempt_status
    FROM "activity_attempts" t JOIN "class_activities" a ON a."id" = t."activity_id"
    WHERE t."id" = NEW."attempt_id";
  IF activity_mode IS DISTINCT FROM 'PRESENT_ONLY' THEN
    RAISE EXCEPTION 'activity % does not take attendance: no pause', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF activity_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % is not active: no pause', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no pause', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."released_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a pause starts open (attempt %)', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "exam_attempt_holds" WHERE "attempt_id" = NEW."attempt_id" AND "resolution" IS NULL) THEN
    RAISE EXCEPTION 'attempt % is on hold: no pause', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Reference data: permissions of specs/018-controlled-exams/contracts/permissions.md ───────
-- Idempotent. Only TEACHER receives them.
INSERT INTO "permissions" ("key", "description") VALUES
  ('provas.visualizar',            'Listar e ver as provas e pedidos de geração do próprio banco'),
  ('provas.criar',                 'Criar provas manualmente'),
  ('provas.editar',                'Editar as próprias provas em rascunho ou aprovadas'),
  ('provas.aprovar',               'Aprovar provas em rascunho do próprio banco'),
  ('provas.arquivar',              'Arquivar e restaurar as próprias provas'),
  ('ia.provas.gerar',              'Pedir a geração de provas com IA a partir de tópicos da ementa'),
  ('provas.encerramentos.decidir', 'Decidir as provas encerradas por avisos: cancelar, devolver ou não cancelar')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'provas.visualizar'),
  ('TEACHER', 'provas.criar'),
  ('TEACHER', 'provas.editar'),
  ('TEACHER', 'provas.aprovar'),
  ('TEACHER', 'provas.arquivar'),
  ('TEACHER', 'ia.provas.gerar'),
  ('TEACHER', 'provas.encerramentos.decidir')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
