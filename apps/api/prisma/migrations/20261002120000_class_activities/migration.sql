-- 012 — Class activities and the student portal (specs/012-student-portal/data-model.md, research
-- P2–P14). Rules Prisma can't express (CHECKs, the partial unique index of the correct alternative,
-- the deferred constraint triggers, the immutability triggers and the seed rows) are written here
-- by hand. Nothing of the 010/011 banks changes: the activity keeps a snapshot of their content.

-- CreateEnum
CREATE TYPE "class_activity_type" AS ENUM ('EXERCISE', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "activity_execution_mode" AS ENUM ('NORMAL');

-- CreateEnum
CREATE TYPE "class_activity_status" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "activity_late_policy" AS ENUM ('REJECT', 'ACCEPT_MARKED');

-- CreateEnum
CREATE TYPE "activity_attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "activity_question_type" AS ENUM ('OPEN_ANSWER', 'MULTIPLE_CHOICE', 'CODE');

-- CreateEnum
CREATE TYPE "activity_grading_status" AS ENUM ('GRADED', 'PENDING_TEACHER', 'DECIDED');

-- CreateEnum
CREATE TYPE "activity_grading_nature" AS ENUM ('RULE_RESULT', 'HUMAN_DECISION');

-- CreateTable
CREATE TABLE "class_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "type" "class_activity_type" NOT NULL,
    "execution_mode" "activity_execution_mode" NOT NULL DEFAULT 'NORMAL',
    "status" "class_activity_status" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "total_grade" DECIMAL(5,2) NOT NULL,
    "question_count" INTEGER NOT NULL,
    "publish_at" TIMESTAMPTZ(6) NOT NULL,
    "deadline" TIMESTAMPTZ(6) NOT NULL,
    "late_policy" "activity_late_policy" NOT NULL,
    "source_work_id" UUID,
    "source_subject_id" UUID,
    "out_of_scope_topic_count" INTEGER NOT NULL DEFAULT 0,
    "result_released_at" TIMESTAMPTZ(6),
    "result_released_by_id" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "idempotency_key" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_activity_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "activity_question_type" NOT NULL,
    "grading_strategy" "work_grading_strategy" NOT NULL,
    "value" DECIMAL(5,2) NOT NULL,
    "statement" TEXT NOT NULL,
    "instructions" TEXT,
    "starter_code" TEXT,
    "language_id" UUID,
    "expected_answer" TEXT,
    "rubric" TEXT,
    "expected_solution" TEXT,
    "explanation" TEXT,
    "is_trick_question" BOOLEAN NOT NULL DEFAULT false,
    "source_exercise_id" UUID,

    CONSTRAINT "class_activity_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_activity_alternatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "class_activity_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_activity_test_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "visibility" "work_test_case_visibility" NOT NULL,

    CONSTRAINT "class_activity_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_activity_question_topics" (
    "question_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,

    CONSTRAINT "class_activity_question_topics_pkey" PRIMARY KEY ("question_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "activity_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "status" "activity_attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_saved_at" TIMESTAMPTZ(6),
    "last_progress_audited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "question_type" "activity_question_type" NOT NULL,
    "text" TEXT,
    "alternative_id" UUID,
    "source" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "saved_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "late" BOOLEAN NOT NULL,
    "blank_count" INTEGER NOT NULL,
    "accepted_by_id" UUID,
    "grade" DECIMAL(5,2) NOT NULL,
    "grade_partial" BOOLEAN NOT NULL,
    "general_feedback" TEXT,
    "graded_at" TIMESTAMPTZ(6),
    "result_viewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_question_gradings" (
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "status" "activity_grading_status" NOT NULL,
    "nature" "activity_grading_nature",
    "final_grade" DECIMAL(5,2),
    "teacher_grade" DECIMAL(5,2),
    "pending_reason" TEXT,
    "feedback" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "activity_question_gradings_pkey" PRIMARY KEY ("submission_id","question_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_activities_teacher_id_idempotency_key_key" ON "class_activities"("teacher_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "class_activities_class_id_status_deadline_idx" ON "class_activities"("class_id", "status", "deadline");

-- CreateIndex
CREATE INDEX "class_activities_class_id_publish_at_idx" ON "class_activities"("class_id", "publish_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_questions_activity_id_position_key" ON "class_activity_questions"("activity_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_questions_id_activity_id_key" ON "class_activity_questions"("id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_questions_id_activity_id_type_key" ON "class_activity_questions"("id", "activity_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_alternatives_question_id_position_key" ON "class_activity_alternatives"("question_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_alternatives_question_id_id_key" ON "class_activity_alternatives"("question_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "class_activity_test_cases_question_id_position_key" ON "class_activity_test_cases"("question_id", "position");

-- CreateIndex
CREATE INDEX "class_activity_question_topics_syllabus_item_id_idx" ON "class_activity_question_topics"("syllabus_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attempts_activity_id_student_user_id_number_key" ON "activity_attempts"("activity_id", "student_user_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attempts_id_activity_id_key" ON "activity_attempts"("id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attempts_id_activity_id_student_user_id_key" ON "activity_attempts"("id", "activity_id", "student_user_id");

-- CreateIndex
CREATE INDEX "activity_attempts_student_user_id_activity_id_idx" ON "activity_attempts"("student_user_id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_answers_attempt_id_question_id_key" ON "activity_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_submissions_attempt_id_key" ON "activity_submissions"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_submissions_id_activity_id_key" ON "activity_submissions"("id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_submissions_attempt_id_activity_id_student_user_id_key" ON "activity_submissions"("attempt_id", "activity_id", "student_user_id");

-- CreateIndex
CREATE INDEX "activity_submissions_activity_id_idx" ON "activity_submissions"("activity_id");

-- CreateIndex
CREATE INDEX "activity_submissions_student_user_id_idx" ON "activity_submissions"("student_user_id");

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_source_work_id_fkey" FOREIGN KEY ("source_work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_source_subject_id_fkey" FOREIGN KEY ("source_subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_result_released_by_id_fkey" FOREIGN KEY ("result_released_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_source_exercise_id_fkey" FOREIGN KEY ("source_exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_alternatives" ADD CONSTRAINT "class_activity_alternatives_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "class_activity_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_test_cases" ADD CONSTRAINT "class_activity_test_cases_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "class_activity_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_question_topics" ADD CONSTRAINT "class_activity_question_topics_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "class_activity_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activity_question_topics" ADD CONSTRAINT "class_activity_question_topics_syllabus_item_id_fkey" FOREIGN KEY ("syllabus_item_id") REFERENCES "syllabus_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The answer belongs to the attempt's activity (research P8): both composite FKs share activity_id.
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_attempt_id_activity_id_fkey" FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- …and to a question of that activity, whose type it carries so the CHECK below validates the shape.
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_question_id_activity_id_question_type_fkey" FOREIGN KEY ("question_id", "activity_id", "question_type") REFERENCES "class_activity_questions"("id", "activity_id", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The chosen alternative is one of the question's (MATCH SIMPLE: a blank choice has no alternative).
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_question_id_alternative_id_fkey" FOREIGN KEY ("question_id", "alternative_id") REFERENCES "class_activity_alternatives"("question_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The submission is of that attempt, of its activity and of its student (research P9).
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_attempt_id_activity_id_student_user_i_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_submission_id_activity_id_fkey" FOREIGN KEY ("submission_id", "activity_id") REFERENCES "activity_submissions"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_question_id_activity_id_fkey" FOREIGN KEY ("question_id", "activity_id") REFERENCES "class_activity_questions"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma can't express.

-- One correct alternative per question; the deferred trigger below adds "exactly one".
CREATE UNIQUE INDEX "class_activity_alternatives_one_correct_key" ON "class_activity_alternatives"("question_id") WHERE "is_correct";

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_title_chk" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_instructions_chk"
  CHECK ("instructions" IS NULL OR char_length("instructions") <= 10000);
-- Exact grades (011 W3): 0.01–100.00 and at least 0.01 per question.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_total_grade_chk"
  CHECK ("total_grade" BETWEEN 0.01 AND 100.00 AND "total_grade" * 100 >= "question_count");
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_question_count_chk" CHECK ("question_count" BETWEEN 1 AND 10);
-- FR-005: the deadline comes after the publication.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_schedule_chk" CHECK ("deadline" > "publish_at");
-- An assignment is a work of the bank, with its subject; an exercise activity has neither (P2, P5).
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_source_chk"
  CHECK (
    ("type" = 'ASSIGNMENT') = ("source_work_id" IS NOT NULL)
    AND ("source_work_id" IS NULL) = ("source_subject_id" IS NULL)
  );
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_out_of_scope_chk" CHECK ("out_of_scope_topic_count" >= 0);
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_release_chk"
  CHECK (("result_released_at" IS NULL) = ("result_released_by_id" IS NULL));
-- The lifecycle (P4): CLOSED has its date; CANCELLED, from ACTIVE or CLOSED, has its own.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_status_chk"
  CHECK (
    ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
    AND ("status" <> 'CLOSED' OR "closed_at" IS NOT NULL)
    AND ("status" <> 'ACTIVE' OR "closed_at" IS NULL)
  );
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_version_chk" CHECK ("version" >= 1);

ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_position_chk" CHECK ("position" BETWEEN 0 AND 9);
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_statement_chk" CHECK (char_length("statement") BETWEEN 1 AND 10000);
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_value_chk" CHECK ("value" BETWEEN 0.01 AND 100.00);
-- The grading strategy is the type's (011 W7).
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_grading_strategy_chk"
  CHECK (
    ("type" = 'MULTIPLE_CHOICE') = ("grading_strategy" = 'EXACT_MATCH')
    AND ("type" = 'CODE') = ("grading_strategy" = 'TEST_CASES')
    AND ("type" = 'OPEN_ANSWER') = ("grading_strategy" = 'AI_REVIEW')
  );
-- The answer key of each type, copied from the bank (P2).
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_open_answer_chk"
  CHECK (("type" = 'OPEN_ANSWER') = ("expected_answer" IS NOT NULL) AND ("rubric" IS NULL OR "type" = 'OPEN_ANSWER'));
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_code_chk"
  CHECK (
    ("type" = 'CODE') = ("expected_solution" IS NOT NULL)
    AND ("type" = 'CODE') = ("language_id" IS NOT NULL)
    AND ("instructions" IS NULL OR "type" = 'CODE')
    AND ("starter_code" IS NULL OR "type" = 'CODE')
  );
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_trick_question_chk"
  CHECK (NOT "is_trick_question" OR "type" = 'MULTIPLE_CHOICE');

ALTER TABLE "class_activity_alternatives" ADD CONSTRAINT "class_activity_alternatives_position_chk" CHECK ("position" BETWEEN 0 AND 4);
ALTER TABLE "class_activity_alternatives" ADD CONSTRAINT "class_activity_alternatives_text_chk" CHECK (char_length("text") BETWEEN 1 AND 2000);

ALTER TABLE "class_activity_test_cases" ADD CONSTRAINT "class_activity_test_cases_position_chk" CHECK ("position" >= 0);
ALTER TABLE "class_activity_test_cases" ADD CONSTRAINT "class_activity_test_cases_text_chk"
  CHECK (char_length("input") <= 10000 AND char_length("expected_output") <= 10000);

-- P7: one attempt per student in 012; a multiple-attempts spec removes this line.
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_number_chk" CHECK ("number" = 1);

-- The shape of an answer follows its question's type (FR-020); sizes of 011's AnswerSchema.
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_shape_chk"
  CHECK (
    CASE "question_type"
      WHEN 'OPEN_ANSWER' THEN "text" IS NOT NULL AND "alternative_id" IS NULL AND "source" IS NULL
      WHEN 'MULTIPLE_CHOICE' THEN "text" IS NULL AND "source" IS NULL
      WHEN 'CODE' THEN "source" IS NOT NULL AND "text" IS NULL AND "alternative_id" IS NULL
    END
  );
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_size_chk"
  CHECK (("text" IS NULL OR char_length("text") <= 20000) AND ("source" IS NULL OR char_length("source") <= 100000));
ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_revision_chk" CHECK ("revision" >= 1);

ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_blank_count_chk" CHECK ("blank_count" BETWEEN 0 AND 10);
-- FR-006b: a submission accepted by the teacher is always late.
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_accepted_chk" CHECK ("accepted_by_id" IS NULL OR "late");
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_grade_chk" CHECK ("grade" BETWEEN 0 AND 100.00);
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_feedback_chk"
  CHECK ("general_feedback" IS NULL OR char_length("general_feedback") <= 5000);
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_version_chk" CHECK ("version" >= 1);

-- A grading's status, nature, grades and pending reason agree (011/SC-011, research P12).
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_state_chk"
  CHECK (
    CASE "status"
      WHEN 'GRADED' THEN "nature" = 'RULE_RESULT' AND "final_grade" IS NOT NULL AND "teacher_grade" IS NULL
        AND "pending_reason" IS NULL AND "decided_by_id" IS NULL AND "decided_at" IS NULL
      WHEN 'PENDING_TEACHER' THEN "nature" IS NULL AND "final_grade" IS NULL AND "teacher_grade" IS NULL
        AND "pending_reason" IS NOT NULL AND "decided_by_id" IS NULL AND "decided_at" IS NULL
      WHEN 'DECIDED' THEN "nature" = 'HUMAN_DECISION' AND "final_grade" IS NOT NULL AND "teacher_grade" = "final_grade"
        AND "pending_reason" IS NULL AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL
    END
  );
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_pending_reason_chk"
  CHECK ("pending_reason" IS NULL OR "pending_reason" IN (
    'CODE_RUNNER_UNAVAILABLE', 'CODE_RUNNER_INFRA_ERROR', 'NO_TEST_CASES',
    'AI_REVIEW_FAILED', 'AI_REVIEW_OUT_OF_RANGE', 'AI_REVIEW_UNAVAILABLE'
  ));
ALTER TABLE "activity_question_gradings" ADD CONSTRAINT "activity_question_gradings_feedback_chk"
  CHECK ("feedback" IS NULL OR char_length("feedback") <= 5000);

-- The snapshot never changes once written (constitution XXIII: an applied activity is a copy).
-- Tests truncate with session_replication_role = replica, which skips these row triggers.
CREATE FUNCTION "class_activity_snapshot_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the snapshot of a class activity (%) is immutable', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "class_activity_questions_immutable"
  BEFORE UPDATE OR DELETE ON "class_activity_questions"
  FOR EACH ROW EXECUTE FUNCTION "class_activity_snapshot_immutable"();

CREATE TRIGGER "class_activity_alternatives_immutable"
  BEFORE UPDATE OR DELETE ON "class_activity_alternatives"
  FOR EACH ROW EXECUTE FUNCTION "class_activity_snapshot_immutable"();

CREATE TRIGGER "class_activity_test_cases_immutable"
  BEFORE UPDATE OR DELETE ON "class_activity_test_cases"
  FOR EACH ROW EXECUTE FUNCTION "class_activity_snapshot_immutable"();

CREATE TRIGGER "class_activity_question_topics_immutable"
  BEFORE UPDATE OR DELETE ON "class_activity_question_topics"
  FOR EACH ROW EXECUTE FUNCTION "class_activity_snapshot_immutable"();

-- The source, type, class and grade of an activity never change; only title, instructions,
-- schedule, late policy, lifecycle and release do (FR-004, FR-005).
CREATE FUNCTION "class_activities_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."teacher_id" IS DISTINCT FROM OLD."teacher_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."execution_mode" IS DISTINCT FROM OLD."execution_mode"
     OR NEW."total_grade" IS DISTINCT FROM OLD."total_grade"
     OR NEW."question_count" IS DISTINCT FROM OLD."question_count"
     OR NEW."source_work_id" IS DISTINCT FROM OLD."source_work_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key" THEN
    RAISE EXCEPTION 'the class, type, mode, grade and source of activity % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" = 'CANCELLED' AND NEW."status" <> 'CANCELLED'
     OR OLD."status" = 'CLOSED' AND NEW."status" = 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % cannot go from % to %', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "class_activities_fixed_columns"
  BEFORE UPDATE ON "class_activities"
  FOR EACH ROW EXECUTE FUNCTION "class_activities_fixed_columns"();

-- At commit, an activity has exactly `question_count` questions at positions 0..question_count-1
-- whose values add up to `total_grade` (011 FR-011, research P6).
CREATE FUNCTION "class_activities_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  activity_row RECORD;
  total INTEGER;
  max_position INTEGER;
  value_sum NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'class_activities' THEN
    target := NEW."id";
  ELSE
    target := NEW."activity_id";
  END IF;

  SELECT "question_count", "total_grade" INTO activity_row FROM "class_activities" WHERE "id" = target;
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
  IF value_sum <> activity_row."total_grade" THEN
    RAISE EXCEPTION 'the question values of activity % add up to %, not %', target, value_sum, activity_row."total_grade"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "class_activities_valid"
  AFTER INSERT ON "class_activities"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "class_activities_valid"();

CREATE CONSTRAINT TRIGGER "class_activity_questions_valid"
  AFTER INSERT ON "class_activity_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "class_activities_valid"();

-- At commit, a MULTIPLE_CHOICE question has 3–5 alternatives with exactly one correct; no other type
-- has alternatives. Only CODE questions have test cases, at most 20.
CREATE FUNCTION "class_activity_questions_parts_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  question_kind "activity_question_type";
  alternative_total INTEGER;
  correct INTEGER;
  test_case_total INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'class_activity_questions' THEN
    target := NEW."id";
  ELSE
    target := NEW."question_id";
  END IF;

  SELECT "type" INTO question_kind FROM "class_activity_questions" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE "is_correct")
    INTO alternative_total, correct
    FROM "class_activity_alternatives" WHERE "question_id" = target;
  SELECT count(*) INTO test_case_total FROM "class_activity_test_cases" WHERE "question_id" = target;

  IF question_kind = 'MULTIPLE_CHOICE' THEN
    IF alternative_total NOT BETWEEN 3 AND 5 OR correct <> 1 THEN
      RAISE EXCEPTION 'multiple choice question % needs 3 to 5 alternatives with exactly one correct', target
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF alternative_total > 0 THEN
    RAISE EXCEPTION 'question % of type % cannot have alternatives', target, question_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF question_kind <> 'CODE' AND test_case_total > 0 OR test_case_total > 20 THEN
    RAISE EXCEPTION 'question % of type % cannot have % test cases', target, question_kind, test_case_total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "class_activity_questions_parts_valid"
  AFTER INSERT ON "class_activity_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "class_activity_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "class_activity_alternatives_valid"
  AFTER INSERT ON "class_activity_alternatives"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "class_activity_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "class_activity_test_cases_valid"
  AFTER INSERT ON "class_activity_test_cases"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "class_activity_questions_parts_valid"();

-- An attempt goes IN_PROGRESS → SUBMITTED once and never back; its activity and student never change.
CREATE FUNCTION "activity_attempts_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'the activity, student and number of attempt % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" = 'SUBMITTED' AND NEW."status" <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'attempt % was submitted and cannot go back', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attempts_transition"
  BEFORE UPDATE ON "activity_attempts"
  FOR EACH ROW EXECUTE FUNCTION "activity_attempts_transition"();

-- No answer of a submitted attempt is written, changed or removed (research P9).
CREATE FUNCTION "activity_answers_open_attempt"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  attempt_status "activity_attempt_status";
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD."attempt_id";
  ELSE
    target := NEW."attempt_id";
  END IF;
  SELECT "status" INTO attempt_status FROM "activity_attempts" WHERE "id" = target;
  IF attempt_status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'attempt % was submitted: its answers are final', target
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_answers_open_attempt"
  BEFORE INSERT OR UPDATE OR DELETE ON "activity_answers"
  FOR EACH ROW EXECUTE FUNCTION "activity_answers_open_attempt"();

-- What was submitted, when and by whom never changes; only the grading columns do.
CREATE FUNCTION "activity_submissions_fixed_columns"() RETURNS trigger
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
     OR NEW."accepted_by_id" IS DISTINCT FROM OLD."accepted_by_id" THEN
    RAISE EXCEPTION 'the submitted facts of submission % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_submissions_fixed_columns"
  BEFORE UPDATE OR DELETE ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "activity_submissions_fixed_columns"();

-- A question's grades lie in 0…its value (011/FR-041).
CREATE FUNCTION "activity_question_gradings_in_range"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  question_value NUMERIC;
BEGIN
  SELECT "value" INTO question_value FROM "class_activity_questions" WHERE "id" = NEW."question_id";
  IF NEW."final_grade" IS NOT NULL AND (NEW."final_grade" < 0 OR NEW."final_grade" > question_value)
     OR NEW."teacher_grade" IS NOT NULL AND (NEW."teacher_grade" < 0 OR NEW."teacher_grade" > question_value) THEN
    RAISE EXCEPTION 'grade of question % out of 0..%', NEW."question_id", question_value
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_question_gradings_in_range"
  BEFORE INSERT OR UPDATE ON "activity_question_gradings"
  FOR EACH ROW EXECUTE FUNCTION "activity_question_gradings_in_range"();

-- Reference data: permissions of specs/012-student-portal/contracts/permissions.md. Idempotent.
INSERT INTO "permissions" ("key", "description") VALUES
  ('atividades.visualizar',          'Listar e ver as atividades das próprias turmas'),
  ('atividades.aplicar',             'Aplicar, publicar, editar, encerrar e cancelar atividades das próprias turmas'),
  ('entregas.visualizar',            'Ver as tentativas e entregas dos alunos das próprias turmas'),
  ('notas.lancar',                   'Corrigir entregas e aceitar tentativas como entrega nas próprias turmas'),
  ('notas.liberar',                  'Liberar aos alunos o resultado das atividades das próprias turmas'),
  ('atividades.proprias.visualizar', 'Ver as próprias atividades, o painel e o histórico'),
  ('atividades.proprias.responder',  'Iniciar, responder e entregar as próprias atividades'),
  ('notas.proprias.visualizar',      'Ver a própria nota e o feedback liberados')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'atividades.visualizar'),
  ('TEACHER', 'atividades.aplicar'),
  ('TEACHER', 'entregas.visualizar'),
  ('TEACHER', 'notas.lancar'),
  ('TEACHER', 'notas.liberar'),
  ('STUDENT', 'atividades.proprias.visualizar'),
  ('STUDENT', 'atividades.proprias.responder'),
  ('STUDENT', 'notas.proprias.visualizar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
