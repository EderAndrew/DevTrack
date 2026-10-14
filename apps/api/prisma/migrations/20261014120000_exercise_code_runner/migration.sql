-- 019 — Code Runner nos Exercícios (specs/019-exercise-code-runner/data-model.md, research B5, B8–B12,
-- B16). The execution profile of the language catalog, the test cases of the exercise bank, the run
-- queue (`code_runs`) with its cases, the workers' heartbeats and the student permission to run.
-- Rules Prisma can't express are written by hand after the generated DDL.

-- CreateEnum
CREATE TYPE "code_run_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "code_run_failure_reason" AS ENUM ('EXPIRED', 'INTERRUPTED', 'DISABLED', 'SANDBOX_ERROR');

-- CreateEnum
CREATE TYPE "code_run_outcome" AS ENUM ('COMPILATION_ERROR', 'EXECUTED');

-- CreateEnum
CREATE TYPE "code_run_verdict" AS ENUM ('PASSED', 'WRONG_OUTPUT', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT', 'OUTPUT_LIMIT');

-- AlterTable
ALTER TABLE "programming_languages" ADD COLUMN     "execution" TEXT;

-- CreateTable
CREATE TABLE "exercise_test_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "visibility" "work_test_case_visibility" NOT NULL,

    CONSTRAINT "exercise_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "execution" TEXT NOT NULL,
    "status" "code_run_status" NOT NULL DEFAULT 'QUEUED',
    "failure_reason" "code_run_failure_reason",
    "outcome" "code_run_outcome",
    "source_code" TEXT,
    "compile_output" TEXT,
    "public_case_count" INTEGER NOT NULL,
    "passed_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "lease_until" TIMESTAMPTZ(6),
    "claimed_by" TEXT,
    "claim_token" UUID,
    "finished_at" TIMESTAMPTZ(6),
    "content_purged_at" TIMESTAMPTZ(6),

    CONSTRAINT "code_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_run_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "verdict" "code_run_verdict" NOT NULL,
    "stdout" TEXT,
    "stderr" TEXT,
    "exit_code" INTEGER,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "code_run_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_runner_heartbeats" (
    "worker_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "executions" JSONB NOT NULL,
    "limits" JSONB NOT NULL,

    CONSTRAINT "code_runner_heartbeats_pkey" PRIMARY KEY ("worker_id")
);

-- CreateIndex
CREATE INDEX "code_runs_attempt_id_question_id_created_at_idx" ON "code_runs"("attempt_id", "question_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "code_run_cases_run_id_position_key" ON "code_run_cases"("run_id", "position");

-- Deferrable so a save can replace or reorder the list in one transaction (research B16).
ALTER TABLE "exercise_test_cases" ADD CONSTRAINT "exercise_test_cases_exercise_id_position_key" UNIQUE ("exercise_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "exercise_test_cases" ADD CONSTRAINT "exercise_test_cases_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_question_id_activity_id_fkey" FOREIGN KEY ("question_id", "activity_id") REFERENCES "class_activity_questions"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_attempt_id_activity_id_student_user_id_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_run_cases" ADD CONSTRAINT "code_run_cases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "code_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_run_cases" ADD CONSTRAINT "code_run_cases_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "class_activity_test_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written rules ──────────────────────────────────────────────────────────────────────

-- The language catalog (research B5): the profile key, data and never a branch on a language.
ALTER TABLE "programming_languages" ADD CONSTRAINT "programming_languages_execution_chk"
  CHECK ("execution" IS NULL OR "execution" IN ('java', 'python', 'javascript'));

UPDATE "programming_languages" SET "execution" = "key" WHERE "key" IN ('java', 'python', 'javascript');

-- ── Test cases of the exercise bank (research B16) ──────────────────────────────────────────

ALTER TABLE "exercise_test_cases" ADD CONSTRAINT "exercise_test_cases_position_chk" CHECK ("position" >= 0);
-- An empty input is a case without stdin; the expected output is never empty (019/FR-001).
ALTER TABLE "exercise_test_cases" ADD CONSTRAINT "exercise_test_cases_text_chk"
  CHECK (char_length("input") <= 10000 AND char_length("expected_output") BETWEEN 1 AND 10000);

-- An archived exercise keeps its cases as they are until it is restored.
CREATE FUNCTION "exercise_test_cases_not_archived"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM "exercises" WHERE "id" = OLD."exercise_id" AND "status" = 'ARCHIVED'))
     OR (TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM "exercises" WHERE "id" = NEW."exercise_id" AND "status" = 'ARCHIVED')) THEN
    RAISE EXCEPTION 'test cases of an archived exercise cannot change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_test_cases_not_archived"
  BEFORE INSERT OR UPDATE OR DELETE ON "exercise_test_cases"
  FOR EACH ROW EXECUTE FUNCTION "exercise_test_cases_not_archived"();

-- At commit: only a CODE exercise has cases, at most 20, at positions 0…n−1. Deferred, so a save can
-- delete and insert the whole list in any order within its transaction.
CREATE FUNCTION "exercise_test_cases_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  exercise_kind "exercise_type";
  total INTEGER;
  distinct_positions INTEGER;
  first_position INTEGER;
  last_position INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD."exercise_id";
  ELSE
    target := NEW."exercise_id";
  END IF;

  SELECT "type" INTO exercise_kind FROM "exercises" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL; -- the exercise was deleted with its cases
  END IF;

  SELECT count(*), count(DISTINCT "position"), min("position"), max("position")
    INTO total, distinct_positions, first_position, last_position
    FROM "exercise_test_cases" WHERE "exercise_id" = target;

  IF total > 0 AND exercise_kind <> 'CODE' THEN
    RAISE EXCEPTION 'exercise % of type % cannot have test cases', target, exercise_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF total > 20 THEN
    RAISE EXCEPTION 'exercise % has more than 20 test cases', target
      USING ERRCODE = 'check_violation';
  END IF;
  IF total > 0 AND (first_position <> 0 OR last_position <> total - 1 OR distinct_positions <> total) THEN
    RAISE EXCEPTION 'test case positions of exercise % must be 0 to n-1', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exercise_test_cases_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exercise_test_cases"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exercise_test_cases_valid"();

-- ── Runs (research B8, B9, B12) ─────────────────────────────────────────────────────────────

-- One pending run per student, whatever the question (019/FR-009).
CREATE UNIQUE INDEX "code_runs_one_pending_key" ON "code_runs"("student_user_id") WHERE "status" IN ('QUEUED', 'RUNNING');
-- The worker's claim, oldest first; the maintenance job's purge.
CREATE INDEX "code_runs_queued_idx" ON "code_runs"("status", "created_at") WHERE "status" = 'QUEUED';
CREATE INDEX "code_runs_purge_idx" ON "code_runs"("finished_at") WHERE "content_purged_at" IS NULL;

ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_execution_chk" CHECK ("execution" IN ('java', 'python', 'javascript'));
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_deadline_chk" CHECK ("deadline_at" > "created_at");
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_counts_chk"
  CHECK (
    "public_case_count" BETWEEN 1 AND 20
    AND ("passed_count" IS NULL OR "passed_count" BETWEEN 0 AND "public_case_count")
    AND ("outcome" IS DISTINCT FROM 'COMPILATION_ERROR' OR "passed_count" = 0)
  );
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_failure_chk" CHECK (("status" = 'FAILED') = ("failure_reason" IS NOT NULL));
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_outcome_chk"
  CHECK (("status" = 'COMPLETED') = ("outcome" IS NOT NULL) AND ("status" = 'COMPLETED') = ("passed_count" IS NOT NULL));
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_finished_chk"
  CHECK (("status" IN ('COMPLETED', 'FAILED')) = ("finished_at" IS NOT NULL));
-- The claim is whole or absent; QUEUED never has one, RUNNING and COMPLETED always do, and a FAILED
-- run has one iff it failed after being claimed.
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_claim_chk"
  CHECK (
    ("claimed_at" IS NULL) = ("lease_until" IS NULL)
    AND ("claimed_at" IS NULL) = ("claimed_by" IS NULL)
    AND ("claimed_at" IS NULL) = ("claim_token" IS NULL)
    AND ("status" <> 'QUEUED' OR "claimed_at" IS NULL)
    AND ("status" NOT IN ('RUNNING', 'COMPLETED') OR "claimed_at" IS NOT NULL)
  );
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_compile_output_chk"
  CHECK ("compile_output" IS NULL OR "outcome" = 'COMPILATION_ERROR');
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_size_chk"
  CHECK (
    ("source_code" IS NULL OR octet_length("source_code") <= 65536)
    AND ("compile_output" IS NULL OR octet_length("compile_output") <= 16384)
  );
-- The source is gone exactly when the content was purged, and only a final run is purged (B12).
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_purge_chk"
  CHECK (
    ("content_purged_at" IS NULL) = ("source_code" IS NOT NULL)
    AND ("content_purged_at" IS NULL OR ("status" IN ('COMPLETED', 'FAILED') AND "compile_output" IS NULL))
  );

-- A run starts QUEUED, on a CODE question of an EXERCISE (019/FR-005). A question of another
-- activity is left to the composite foreign key.
CREATE FUNCTION "code_runs_insert_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  question_kind "activity_question_type";
  activity_kind "class_activity_type";
BEGIN
  IF NEW."status" <> 'QUEUED' OR NEW."content_purged_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a code run starts QUEUED'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT q."type", a."type" INTO question_kind, activity_kind
    FROM "class_activity_questions" q JOIN "class_activities" a ON a."id" = q."activity_id"
    WHERE q."id" = NEW."question_id" AND q."activity_id" = NEW."activity_id";
  IF FOUND AND (question_kind <> 'CODE' OR activity_kind <> 'EXERCISE') THEN
    RAISE EXCEPTION 'code run question % is not a CODE question of an exercise', NEW."question_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "code_runs_insert_valid"
  BEFORE INSERT ON "code_runs"
  FOR EACH ROW EXECUTE FUNCTION "code_runs_insert_valid"();

-- Transitions only QUEUED→RUNNING, QUEUED→FAILED, RUNNING→COMPLETED, RUNNING→FAILED (019/FR-017).
-- What the run is never changes; the content may only be emptied (then the CHECKs ask for a final
-- run and `content_purged_at`). A final row accepts only the purge, once.
CREATE FUNCTION "code_runs_update_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."source_code" IS DISTINCT FROM OLD."source_code" AND NEW."source_code" IS NOT NULL
     OR NEW."compile_output" IS DISTINCT FROM OLD."compile_output" AND NEW."compile_output" IS NOT NULL AND OLD."status" IN ('COMPLETED', 'FAILED') THEN
    IF OLD."status" IN ('COMPLETED', 'FAILED') THEN
      RAISE EXCEPTION 'a final code run only accepts the content purge (run %)', OLD."id"
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE EXCEPTION 'the source code of a code run is immutable (run %)', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD."status" IN ('COMPLETED', 'FAILED') THEN
    IF (NEW."status", NEW."failure_reason", NEW."outcome", NEW."passed_count", NEW."claimed_at", NEW."lease_until",
        NEW."claimed_by", NEW."claim_token", NEW."finished_at")
       IS DISTINCT FROM
       (OLD."status", OLD."failure_reason", OLD."outcome", OLD."passed_count", OLD."claimed_at", OLD."lease_until",
        OLD."claimed_by", OLD."claim_token", OLD."finished_at")
       OR (OLD."content_purged_at" IS NOT NULL AND NEW."content_purged_at" IS DISTINCT FROM OLD."content_purged_at")
       OR (NEW."activity_id", NEW."question_id", NEW."attempt_id", NEW."student_user_id", NEW."execution",
           NEW."public_case_count", NEW."created_at", NEW."deadline_at")
          IS DISTINCT FROM
          (OLD."activity_id", OLD."question_id", OLD."attempt_id", OLD."student_user_id", OLD."execution",
           OLD."public_case_count", OLD."created_at", OLD."deadline_at") THEN
      RAISE EXCEPTION 'a final code run only accepts the content purge (run %)', OLD."id"
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW."activity_id", NEW."question_id", NEW."attempt_id", NEW."student_user_id", NEW."execution",
      NEW."public_case_count", NEW."created_at", NEW."deadline_at")
     IS DISTINCT FROM
     (OLD."activity_id", OLD."question_id", OLD."attempt_id", OLD."student_user_id", OLD."execution",
      OLD."public_case_count", OLD."created_at", OLD."deadline_at") THEN
    RAISE EXCEPTION 'what a code run is (activity, question, attempt, student, profile, cases, times) is immutable (run %)', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'QUEUED' AND NEW."status" IN ('RUNNING', 'FAILED'))
       OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('COMPLETED', 'FAILED'))
     ) THEN
    RAISE EXCEPTION 'code run transition % to % is not allowed (run %)', OLD."status", NEW."status", OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "code_runs_update_valid"
  BEFORE UPDATE ON "code_runs"
  FOR EACH ROW EXECUTE FUNCTION "code_runs_update_valid"();

CREATE FUNCTION "code_runs_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'code runs cannot be deleted'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "code_runs_no_delete"
  BEFORE DELETE ON "code_runs"
  FOR EACH ROW EXECUTE FUNCTION "code_runs_no_delete"();

-- ── Cases of a run (research B6) ────────────────────────────────────────────────────────────

ALTER TABLE "code_run_cases" ADD CONSTRAINT "code_run_cases_position_chk" CHECK ("position" BETWEEN 0 AND 19);
ALTER TABLE "code_run_cases" ADD CONSTRAINT "code_run_cases_size_chk"
  CHECK (
    ("stdout" IS NULL OR octet_length("stdout") <= 65536)
    AND ("stderr" IS NULL OR octet_length("stderr") <= 16384)
    AND "duration_ms" >= 0
  );

-- A case belongs to a COMPLETED/EXECUTED run, and is a PUBLIC case of the run's question at its
-- position among the PUBLIC ones (019/FR-004: nothing of a private case is ever written here).
CREATE FUNCTION "code_run_cases_insert_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run "code_runs"%ROWTYPE;
  case_question UUID;
  case_visibility "work_test_case_visibility";
  case_position INTEGER;
  public_position INTEGER;
BEGIN
  SELECT * INTO run FROM "code_runs" WHERE "id" = NEW."run_id";
  IF NOT FOUND THEN
    RETURN NEW; -- left to the foreign key
  END IF;
  IF run."status" <> 'COMPLETED' OR run."outcome" <> 'EXECUTED' OR run."content_purged_at" IS NOT NULL THEN
    RAISE EXCEPTION 'code run cases need a COMPLETED EXECUTED run (run %)', NEW."run_id"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT "question_id", "visibility", "position" INTO case_question, case_visibility, case_position
    FROM "class_activity_test_cases" WHERE "id" = NEW."test_case_id";
  IF NOT FOUND THEN
    RETURN NEW; -- left to the foreign key
  END IF;
  IF case_question <> run."question_id" OR case_visibility <> 'PUBLIC' THEN
    RAISE EXCEPTION 'code run case % is not a PUBLIC case of the run''s question', NEW."test_case_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO public_position
    FROM "class_activity_test_cases"
    WHERE "question_id" = case_question AND "visibility" = 'PUBLIC' AND "position" < case_position;
  IF NEW."position" <> public_position THEN
    RAISE EXCEPTION 'code run case position % does not match the case''s position % among the public cases', NEW."position", public_position
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "code_run_cases_insert_valid"
  BEFORE INSERT ON "code_run_cases"
  FOR EACH ROW EXECUTE FUNCTION "code_run_cases_insert_valid"();

-- Immutable, except the purge of the outputs (research B12).
CREATE FUNCTION "code_run_cases_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW."run_id", NEW."test_case_id", NEW."position", NEW."verdict", NEW."exit_code", NEW."duration_ms")
        IS DISTINCT FROM (OLD."run_id", OLD."test_case_id", OLD."position", OLD."verdict", OLD."exit_code", OLD."duration_ms")
     OR (NEW."stdout" IS DISTINCT FROM OLD."stdout" AND NEW."stdout" IS NOT NULL)
     OR (NEW."stderr" IS DISTINCT FROM OLD."stderr" AND NEW."stderr" IS NOT NULL) THEN
    RAISE EXCEPTION 'code run cases are immutable except the content purge'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "code_run_cases_immutable"
  BEFORE UPDATE OR DELETE ON "code_run_cases"
  FOR EACH ROW EXECUTE FUNCTION "code_run_cases_immutable"();

-- At commit, an EXECUTED run has exactly one case per PUBLIC case it counted; any other run has none.
CREATE FUNCTION "code_runs_cases_complete"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  run "code_runs"%ROWTYPE;
  total INTEGER;
  expected INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'code_runs' THEN
    target := NEW."id";
  ELSE
    target := NEW."run_id";
  END IF;
  SELECT * INTO run FROM "code_runs" WHERE "id" = target;
  SELECT count(*) INTO total FROM "code_run_cases" WHERE "run_id" = target;
  expected := CASE WHEN run."status" = 'COMPLETED' AND run."outcome" = 'EXECUTED' THEN run."public_case_count" ELSE 0 END;
  IF total <> expected THEN
    RAISE EXCEPTION 'code run % has % cases for % public cases', target, total, expected
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "code_run_cases_complete"
  AFTER INSERT ON "code_run_cases"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "code_runs_cases_complete"();

CREATE CONSTRAINT TRIGGER "code_runs_cases_complete"
  AFTER UPDATE OF "status" ON "code_runs"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "code_runs_cases_complete"();

-- ── Workers (research B10) ──────────────────────────────────────────────────────────────────

ALTER TABLE "code_runner_heartbeats" ADD CONSTRAINT "code_runner_heartbeats_json_chk"
  CHECK (jsonb_typeof("executions") = 'array' AND jsonb_typeof("limits") = 'object');

-- ── Reference data: permissions of specs/019-exercise-code-runner/contracts/permissions.md ───
-- Idempotent. Only STUDENT receives it.
INSERT INTO "permissions" ("key", "description") VALUES
  ('atividades.proprias.executar', 'Executar o próprio código nos casos públicos de um exercício e ver o resultado')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('STUDENT', 'atividades.proprias.executar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
