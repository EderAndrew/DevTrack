-- 011 — Work bank (specs/011-work-bank/data-model.md, research W2, W3, W7, W15, W16, W18).
-- Rules Prisma can't express (CHECKs, deferrable position constraints, the partial unique index of
-- the correct alternative, the deferred constraint triggers, the immutability triggers and the
-- seed rows) are written here by hand. Nothing of the 010 exercise bank changes (SC-013).

-- CreateEnum
CREATE TYPE "work_question_type" AS ENUM ('OPEN_ANSWER', 'MULTIPLE_CHOICE', 'CODE');

-- CreateEnum
CREATE TYPE "work_grading_strategy" AS ENUM ('EXACT_MATCH', 'TEST_CASES', 'AI_REVIEW');

-- CreateEnum
CREATE TYPE "work_difficulty" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "work_origin" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "work_status" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "work_test_case_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "syllabus_revision_id" UUID,
    "title" TEXT NOT NULL,
    "title_search_key" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "work_difficulty",
    "total_grade" DECIMAL(5,2) NOT NULL,
    "question_count" INTEGER NOT NULL,
    "origin" "work_origin" NOT NULL,
    "status" "work_status" NOT NULL DEFAULT 'DRAFT',
    "archived_from_status" "work_status",
    "generation_request_id" UUID,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "human_edited" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_topics" (
    "work_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "work_topics_pkey" PRIMARY KEY ("work_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "work_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "work_question_type" NOT NULL,
    "grading_strategy" "work_grading_strategy" NOT NULL,
    "statement" TEXT NOT NULL,
    "statement_search_key" TEXT NOT NULL,
    "value" DECIMAL(5,2) NOT NULL,
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

    CONSTRAINT "work_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_question_alternatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "work_question_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_question_test_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "visibility" "work_test_case_visibility" NOT NULL,

    CONSTRAINT "work_question_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_question_topics" (
    "question_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,

    CONSTRAINT "work_question_topics_pkey" PRIMARY KEY ("question_id","syllabus_item_id")
);

-- CreateTable
CREATE TABLE "work_generation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "work_difficulty" NOT NULL,
    "total_grade" DECIMAL(5,2) NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "open_answer_quantity" INTEGER NOT NULL,
    "multiple_choice_quantity" INTEGER NOT NULL,
    "code_quantity" INTEGER NOT NULL,
    "trick_question_quantity" INTEGER NOT NULL,
    "language_id" UUID,
    "distribution" TEXT NOT NULL,
    "ai_execution_id" UUID,
    "regenerated_from_id" UUID,
    "idempotency_key" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_generation_request_topics" (
    "request_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "work_generation_request_topics_pkey" PRIMARY KEY ("request_id","syllabus_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "works_generation_request_id_key" ON "works"("generation_request_id");

-- CreateIndex
CREATE INDEX "works_teacher_id_status_updated_at_id_idx" ON "works"("teacher_id", "status", "updated_at" DESC, "id");

-- CreateIndex
CREATE INDEX "works_teacher_id_subject_id_idx" ON "works"("teacher_id", "subject_id");

-- CreateIndex
CREATE INDEX "works_teacher_id_created_at_idx" ON "works"("teacher_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "works_id_syllabus_revision_id_key" ON "works"("id", "syllabus_revision_id");

-- CreateIndex
CREATE INDEX "work_topics_syllabus_item_id_idx" ON "work_topics"("syllabus_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_topics_work_id_position_key" ON "work_topics"("work_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "work_questions_id_work_id_key" ON "work_questions"("id", "work_id");

-- CreateIndex
-- Deferrable, so a reorder can swap positions within the transaction (research W16).
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_work_id_position_key" UNIQUE ("work_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE UNIQUE INDEX "work_questions_work_id_generation_item_id_key" ON "work_questions"("work_id", "generation_item_id");

-- CreateIndex
ALTER TABLE "work_question_alternatives" ADD CONSTRAINT "work_question_alternatives_question_id_position_key" UNIQUE ("question_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
ALTER TABLE "work_question_test_cases" ADD CONSTRAINT "work_question_test_cases_question_id_position_key" UNIQUE ("question_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE UNIQUE INDEX "work_generation_requests_ai_execution_id_key" ON "work_generation_requests"("ai_execution_id");

-- CreateIndex
CREATE INDEX "work_generation_requests_teacher_id_created_at_id_idx" ON "work_generation_requests"("teacher_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_generation_requests_id_syllabus_revision_id_key" ON "work_generation_requests"("id", "syllabus_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_generation_requests_teacher_id_idempotency_key_key" ON "work_generation_requests"("teacher_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "work_generation_request_topics_request_id_position_key" ON "work_generation_request_topics"("request_id", "position");

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_generation_request_id_fkey" FOREIGN KEY ("generation_request_id") REFERENCES "work_generation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_topics" ADD CONSTRAINT "work_topics_work_id_syllabus_revision_id_fkey" FOREIGN KEY ("work_id", "syllabus_revision_id") REFERENCES "works"("id", "syllabus_revision_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_topics" ADD CONSTRAINT "work_topics_syllabus_item_id_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_item_id", "syllabus_revision_id") REFERENCES "syllabus_items"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_question_alternatives" ADD CONSTRAINT "work_question_alternatives_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "work_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_question_test_cases" ADD CONSTRAINT "work_question_test_cases_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "work_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_question_topics" ADD CONSTRAINT "work_question_topics_question_id_work_id_fkey" FOREIGN KEY ("question_id", "work_id") REFERENCES "work_questions"("id", "work_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_question_topics" ADD CONSTRAINT "work_question_topics_work_id_syllabus_item_id_fkey" FOREIGN KEY ("work_id", "syllabus_item_id") REFERENCES "work_topics"("work_id", "syllabus_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_ai_execution_id_fkey" FOREIGN KEY ("ai_execution_id") REFERENCES "ai_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_regenerated_from_id_fkey" FOREIGN KEY ("regenerated_from_id") REFERENCES "work_generation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_request_topics" ADD CONSTRAINT "work_generation_request_topics_request_id_syllabus_revisio_fkey" FOREIGN KEY ("request_id", "syllabus_revision_id") REFERENCES "work_generation_requests"("id", "syllabus_revision_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_generation_request_topics" ADD CONSTRAINT "work_generation_request_topics_syllabus_item_id_syllabus_r_fkey" FOREIGN KEY ("syllabus_item_id", "syllabus_revision_id") REFERENCES "syllabus_items"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma can't express (research W2).

-- One correct alternative per question; the deferred trigger below adds "exactly one".
CREATE UNIQUE INDEX "work_question_alternatives_one_correct_key" ON "work_question_alternatives"("question_id") WHERE "is_correct";

ALTER TABLE "works" ADD CONSTRAINT "works_title_chk" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "works" ADD CONSTRAINT "works_description_chk" CHECK ("description" IS NULL OR char_length("description") <= 5000);
-- Exact grades (research W3, FR-011): 0.01–100.00 and at least 0.01 per question.
ALTER TABLE "works" ADD CONSTRAINT "works_total_grade_chk"
  CHECK ("total_grade" BETWEEN 0.01 AND 100.00 AND "total_grade" * 100 >= "question_count");
ALTER TABLE "works" ADD CONSTRAINT "works_question_count_chk" CHECK ("question_count" BETWEEN 1 AND 10);
-- The restore target exists exactly while archived, and is never ARCHIVED itself (FR-016).
ALTER TABLE "works" ADD CONSTRAINT "works_archived_chk"
  CHECK (("status" = 'ARCHIVED') = ("archived_from_status" IS NOT NULL) AND "archived_from_status" IS DISTINCT FROM 'ARCHIVED');
-- An AI_GENERATED work always has its request, its revision and its difficulty; a MANUAL one never
-- has a request.
ALTER TABLE "works" ADD CONSTRAINT "works_origin_chk"
  CHECK (
    ("origin" = 'AI_GENERATED') = ("generation_request_id" IS NOT NULL)
    AND ("origin" = 'MANUAL' OR ("syllabus_revision_id" IS NOT NULL AND "difficulty" IS NOT NULL))
  );
ALTER TABLE "works" ADD CONSTRAINT "works_reviewed_chk"
  CHECK (("reviewed_by_id" IS NULL) = ("reviewed_at" IS NULL));
-- An AI draft reaches the bank only through a person's review (FR-014).
ALTER TABLE "works" ADD CONSTRAINT "works_ai_approved_chk"
  CHECK (NOT ("origin" = 'AI_GENERATED' AND "status" = 'APPROVED') OR ("human_reviewed" AND "reviewed_by_id" IS NOT NULL));
ALTER TABLE "works" ADD CONSTRAINT "works_version_chk" CHECK ("version" >= 1);

ALTER TABLE "work_topics" ADD CONSTRAINT "work_topics_position_chk" CHECK ("position" >= 0);

ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_position_chk" CHECK ("position" >= 0);
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_statement_chk" CHECK (char_length("statement") BETWEEN 1 AND 10000);
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_explanation_chk"
  CHECK ("explanation" IS NULL OR char_length("explanation") <= 10000);
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_value_chk" CHECK ("value" >= 0.01);
-- The grading strategy is the type's (research W7, FR-036).
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_grading_strategy_chk"
  CHECK (
    ("type" = 'MULTIPLE_CHOICE') = ("grading_strategy" = 'EXACT_MATCH')
    AND ("type" = 'CODE') = ("grading_strategy" = 'TEST_CASES')
    AND ("type" = 'OPEN_ANSWER') = ("grading_strategy" = 'AI_REVIEW')
  );
-- The fields of each type (FR-004–FR-006): required for that type, absent from the others.
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_open_answer_chk"
  CHECK (("type" = 'OPEN_ANSWER') = ("expected_answer" IS NOT NULL) AND ("rubric" IS NULL OR "type" = 'OPEN_ANSWER'));
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_code_chk"
  CHECK (
    ("type" = 'CODE') = ("expected_solution" IS NOT NULL)
    AND ("type" = 'CODE') = ("language_id" IS NOT NULL)
    AND ("instructions" IS NULL OR "type" = 'CODE')
    AND ("starter_code" IS NULL OR "type" = 'CODE')
  );
-- A trick question is a multiple-choice question (FR-005).
ALTER TABLE "work_questions" ADD CONSTRAINT "work_questions_trick_question_chk"
  CHECK (NOT "is_trick_question" OR "type" = 'MULTIPLE_CHOICE');

ALTER TABLE "work_question_alternatives" ADD CONSTRAINT "work_question_alternatives_position_chk" CHECK ("position" >= 0);
ALTER TABLE "work_question_alternatives" ADD CONSTRAINT "work_question_alternatives_text_chk"
  CHECK (char_length("text") BETWEEN 1 AND 2000);

ALTER TABLE "work_question_test_cases" ADD CONSTRAINT "work_question_test_cases_position_chk" CHECK ("position" >= 0);
ALTER TABLE "work_question_test_cases" ADD CONSTRAINT "work_question_test_cases_text_chk"
  CHECK (char_length("input") <= 10000 AND char_length("expected_output") <= 10000);

-- A generation request (FR-018–FR-022).
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_title_chk" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_description_chk"
  CHECK ("description" IS NULL OR char_length("description") <= 5000);
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_total_grade_chk"
  CHECK ("total_grade" BETWEEN 0.01 AND 100.00 AND "total_grade" * 100 >= "requested_quantity");
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_quantity_chk"
  CHECK (
    "requested_quantity" BETWEEN 1 AND 10
    AND "open_answer_quantity" >= 0 AND "multiple_choice_quantity" >= 0 AND "code_quantity" >= 0
    AND "open_answer_quantity" + "multiple_choice_quantity" + "code_quantity" = "requested_quantity"
  );
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_trick_chk"
  CHECK ("trick_question_quantity" BETWEEN 0 AND 3 AND "trick_question_quantity" <= "multiple_choice_quantity");
-- The language comes from the revision and matters only for code.
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_language_chk"
  CHECK (("code_quantity" > 0) = ("language_id" IS NOT NULL));
ALTER TABLE "work_generation_requests" ADD CONSTRAINT "work_generation_requests_distribution_chk"
  CHECK ("distribution" IN ('AUTO', 'MANUAL'));

ALTER TABLE "work_generation_request_topics" ADD CONSTRAINT "work_generation_request_topics_position_chk" CHECK ("position" >= 0);

-- A work's origin and a question's type never change, even when edited. Tests truncate with
-- session_replication_role = replica, which skips these row triggers.
CREATE FUNCTION "works_origin_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" THEN
    RAISE EXCEPTION 'work origin is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "works_origin_immutable"
  BEFORE UPDATE ON "works"
  FOR EACH ROW EXECUTE FUNCTION "works_origin_immutable"();

CREATE FUNCTION "work_questions_type_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type" OR NEW."work_id" IS DISTINCT FROM OLD."work_id" THEN
    RAISE EXCEPTION 'work question type and work are immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_questions_type_immutable"
  BEFORE UPDATE ON "work_questions"
  FOR EACH ROW EXECUTE FUNCTION "work_questions_type_immutable"();

-- At commit, a work has exactly `question_count` questions at positions 0..question_count-1 whose
-- values add up to `total_grade` (FR-011), and 0–10 topics, with a revision iff it has a topic.
-- Deferred and fired on the three tables, so a work, its questions and its topics can be written in
-- any order within the transaction.
CREATE FUNCTION "works_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  work_row RECORD;
  total INTEGER;
  max_position INTEGER;
  value_sum NUMERIC;
  topic_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'works' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."work_id";
  ELSE
    target := NEW."work_id";
  END IF;

  SELECT "question_count", "total_grade", "syllabus_revision_id" INTO work_row FROM "works" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), max("position"), coalesce(sum("value"), 0)
    INTO total, max_position, value_sum
    FROM "work_questions" WHERE "work_id" = target;
  IF total <> work_row."question_count" OR max_position IS DISTINCT FROM total - 1 THEN
    RAISE EXCEPTION 'work % needs % questions at contiguous positions, has %', target, work_row."question_count", total
      USING ERRCODE = 'check_violation';
  END IF;
  IF value_sum <> work_row."total_grade" THEN
    RAISE EXCEPTION 'the question values of work % add up to %, not %', target, value_sum, work_row."total_grade"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO topic_count FROM "work_topics" WHERE "work_id" = target;
  IF topic_count > 10 OR (topic_count > 0) <> (work_row."syllabus_revision_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'work % needs 0 to 10 topics, with a revision iff it has one', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "works_valid"
  AFTER INSERT OR UPDATE ON "works"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "works_valid"();

CREATE CONSTRAINT TRIGGER "work_questions_works_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "work_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "works_valid"();

CREATE CONSTRAINT TRIGGER "work_topics_works_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "work_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "works_valid"();

-- At commit, a MULTIPLE_CHOICE question has 3–5 alternatives, exactly one correct and no two texts
-- equal after trimming, collapsing spaces and lowercasing; no other type has alternatives. A CODE
-- question has at most 20 test cases; no other type has any (FR-004–FR-006).
CREATE FUNCTION "work_questions_parts_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  question_kind "work_question_type";
  alternative_total INTEGER;
  correct INTEGER;
  distinct_texts INTEGER;
  test_case_total INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'work_questions' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."question_id";
  ELSE
    target := NEW."question_id";
  END IF;

  SELECT "type" INTO question_kind FROM "work_questions" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL; -- the question was deleted with its parts
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE "is_correct"),
         count(DISTINCT lower(regexp_replace(btrim("text"), '\s+', ' ', 'g')))
    INTO alternative_total, correct, distinct_texts
    FROM "work_question_alternatives" WHERE "question_id" = target;
  SELECT count(*) INTO test_case_total FROM "work_question_test_cases" WHERE "question_id" = target;

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

CREATE CONSTRAINT TRIGGER "work_questions_parts_valid"
  AFTER INSERT ON "work_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "work_question_alternatives_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "work_question_alternatives"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_questions_parts_valid"();

CREATE CONSTRAINT TRIGGER "work_question_test_cases_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "work_question_test_cases"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_questions_parts_valid"();

-- At commit, a question links at most 3 topics (of its own work, by the composite FKs).
CREATE FUNCTION "work_question_topics_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  topic_count INTEGER;
BEGIN
  SELECT count(*) INTO topic_count FROM "work_question_topics" WHERE "question_id" = NEW."question_id";
  IF topic_count > 3 THEN
    RAISE EXCEPTION 'question % links more than 3 topics', NEW."question_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "work_question_topics_valid"
  AFTER INSERT OR UPDATE ON "work_question_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_question_topics_valid"();

-- At commit, a generation request has 1–10 topics and at most 3 per requested question (FR-021).
CREATE FUNCTION "work_generation_requests_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  quantity INTEGER;
  topic_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'work_generation_requests' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."request_id";
  ELSE
    target := NEW."request_id";
  END IF;

  SELECT "requested_quantity" INTO quantity FROM "work_generation_requests" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO topic_count FROM "work_generation_request_topics" WHERE "request_id" = target;
  IF topic_count NOT BETWEEN 1 AND 10 OR topic_count > 3 * quantity THEN
    RAISE EXCEPTION 'generation request % needs 1 to 10 topics and at most 3 per question, has %', target, topic_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "work_generation_requests_valid"
  AFTER INSERT OR UPDATE ON "work_generation_requests"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_generation_requests_valid"();

CREATE CONSTRAINT TRIGGER "work_generation_request_topics_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "work_generation_request_topics"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "work_generation_requests_valid"();

-- Reference data: permissions of specs/011-work-bank/contracts/permissions.md.
-- Idempotent. Only TEACHER receives them.
INSERT INTO "permissions" ("key", "description") VALUES
  ('trabalhos.visualizar', 'Listar e ver os trabalhos e pedidos de geração do próprio banco'),
  ('trabalhos.criar',      'Criar trabalhos manualmente'),
  ('trabalhos.editar',     'Editar os próprios trabalhos em rascunho ou aprovados'),
  ('trabalhos.arquivar',   'Arquivar e restaurar os próprios trabalhos'),
  ('trabalhos.aprovar',    'Aprovar trabalhos em rascunho do próprio banco'),
  ('ia.trabalhos.gerar',   'Pedir a geração de trabalhos com IA a partir de tópicos da ementa')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'trabalhos.visualizar'),
  ('TEACHER', 'trabalhos.criar'),
  ('TEACHER', 'trabalhos.editar'),
  ('TEACHER', 'trabalhos.arquivar'),
  ('TEACHER', 'trabalhos.aprovar'),
  ('TEACHER', 'ia.trabalhos.gerar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
