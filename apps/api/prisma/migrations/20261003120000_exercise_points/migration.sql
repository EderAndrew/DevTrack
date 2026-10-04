-- 013 — Exercise points and the class ranking (specs/013-exercise-points-ranking/data-model.md,
-- research K1–K7, K14, K17). An EXERCISE activity loses grade, deadline and late policy and its
-- questions carry the exercise's difficulty and fixed points; students get numbered practice
-- attempts with one open at a time; a concluded EXERCISE attempt writes one row per question in
-- `exercise_question_results`. ASSIGNMENT keeps every 012 rule: the new CHECKs are "by type".
-- The conversion of the 012 EXERCISE data comes last (K17).

-- CreateEnum
CREATE TYPE "exercise_result" AS ENUM ('CORRECT', 'WRONG', 'PENDING_TEACHER', 'UNSCORED');

-- AlterTable: grade, deadline and late policy only for ASSIGNMENT (K1).
ALTER TABLE "class_activities" ALTER COLUMN "total_grade" DROP NOT NULL,
  ALTER COLUMN "deadline" DROP NOT NULL,
  ALTER COLUMN "late_policy" DROP NOT NULL;

-- AlterTable: a question's value only for ASSIGNMENT; difficulty and points only for EXERCISE (K1, K2).
ALTER TABLE "class_activity_questions" ALTER COLUMN "value" DROP NOT NULL,
  ADD COLUMN "difficulty" "exercise_difficulty",
  ADD COLUMN "points" INTEGER;

-- AlterTable: the conclusion time of an EXERCISE attempt (K3).
ALTER TABLE "activity_attempts" ADD COLUMN "completed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "exercise_question_results" (
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "question_points" INTEGER NOT NULL,
    "class_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "source_exercise_id" UUID NOT NULL,
    "scoring" BOOLEAN NOT NULL,
    "result" "exercise_result" NOT NULL,
    "points" INTEGER NOT NULL,
    "nature" "activity_grading_nature",
    "comment" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercise_question_results_pkey" PRIMARY KEY ("attempt_id","question_id")
);

-- CreateIndex: target of the results' composite FK (the question's points travel with it).
CREATE UNIQUE INDEX "class_activity_questions_id_activity_id_points_key" ON "class_activity_questions"("id", "activity_id", "points");

-- CreateIndex
CREATE INDEX "exercise_question_results_activity_id_idx" ON "exercise_question_results"("activity_id");

-- AddForeignKey: the result is of an attempt of that activity and of its student (K6).
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_attempt_id_activity_id_student_u_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: …and of a question of that activity, whose points it carries for the CHECK below.
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_question_id_activity_id_question_fkey" FOREIGN KEY ("question_id", "activity_id", "question_points") REFERENCES "class_activity_questions"("id", "activity_id", "points") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_source_exercise_id_fkey" FOREIGN KEY ("source_exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma can't express.

-- K1: grade, deadline and late policy iff ASSIGNMENT; an EXERCISE is never released (no result to
-- release). NOT VALID until the 012 data is converted at the end of this migration.
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_type_fields_chk"
  CHECK (
    ("type" = 'ASSIGNMENT') = ("total_grade" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT') = ("deadline" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT') = ("late_policy" IS NOT NULL)
    AND ("type" = 'ASSIGNMENT' OR "result_released_at" IS NULL)
  ) NOT VALID;

-- K2: the points are the difficulty's (013/FR-002), or neither is set (an ASSIGNMENT question). Written
-- so that one NULL of the pair is false, not unknown (a CHECK passes on NULL).
ALTER TABLE "class_activity_questions" ADD CONSTRAINT "class_activity_questions_points_chk"
  CHECK (
    CASE
      WHEN "difficulty" IS NULL THEN "points" IS NULL
      ELSE "points" IS NOT NULL
        AND "points" = CASE "difficulty" WHEN 'BASIC' THEN 15 WHEN 'INTERMEDIATE' THEN 30 WHEN 'ADVANCED' THEN 60 END
    END
  );

-- K3: numbered attempts (the 012 `number = 1` goes); one open attempt per student and activity.
ALTER TABLE "activity_attempts" DROP CONSTRAINT "activity_attempts_number_chk";
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_number_chk" CHECK ("number" >= 1);
CREATE UNIQUE INDEX "activity_attempts_one_open" ON "activity_attempts"("activity_id", "student_user_id") WHERE "status" = 'IN_PROGRESS';

-- K6: the scoring row of a bank exercise is unique per student and class (013/FR-010a).
CREATE UNIQUE INDEX "exercise_question_results_once_per_class" ON "exercise_question_results"("class_id", "student_user_id", "source_exercise_id") WHERE "scoring";
-- The ranking sums the scoring rows of a class (K11); the roster counts the pending marks.
CREATE INDEX "exercise_question_results_ranking_idx" ON "exercise_question_results"("class_id", "student_user_id") WHERE "scoring";
CREATE INDEX "exercise_question_results_pending_idx" ON "exercise_question_results"("activity_id", "result") WHERE "result" = 'PENDING_TEACHER';

-- FR-010: all or nothing — the question's points only for a CORRECT scoring row.
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_points_chk"
  CHECK ("points" = CASE WHEN "scoring" AND "result" = 'CORRECT' THEN "question_points" ELSE 0 END);
-- Waiting for the teacher only on the scoring row; "Compare com o gabarito" only off it (K6).
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_scoring_chk"
  CHECK (("result" <> 'PENDING_TEACHER' OR "scoring") AND ("result" <> 'UNSCORED' OR NOT "scoring"));
-- A result by the rule or by the teacher has its nature; pending and unscored have none. The
-- teacher's decision has its author and date; the comment is the teacher's (K8).
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_nature_chk"
  CHECK (
    ("nature" IS NULL) = ("result" IN ('PENDING_TEACHER', 'UNSCORED'))
    AND ("nature" = 'HUMAN_DECISION') = ("decided_by_id" IS NOT NULL)
    AND ("decided_by_id" IS NULL) = ("decided_at" IS NULL)
    AND ("comment" IS NULL OR "nature" = 'HUMAN_DECISION')
  );
ALTER TABLE "exercise_question_results" ADD CONSTRAINT "exercise_question_results_comment_chk"
  CHECK ("comment" IS NULL OR char_length("comment") <= 2000);

-- At commit, an activity has exactly `question_count` questions at positions 0..question_count-1;
-- an ASSIGNMENT's values add up to `total_grade` and its questions have no difficulty, points or
-- exercise; an EXERCISE's questions have no value and carry the exercise, its difficulty and points
-- (012 research P6, 013 K1, K2). Replaces the 012 function; its triggers stay.
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

  IF activity_row."type" = 'ASSIGNMENT' THEN
    SELECT count(*) INTO misplaced FROM "class_activity_questions"
      WHERE "activity_id" = target
        AND ("value" IS NULL OR "difficulty" IS NOT NULL OR "points" IS NOT NULL OR "source_exercise_id" IS NOT NULL);
    IF misplaced > 0 THEN
      RAISE EXCEPTION 'the questions of assignment % need a value and no difficulty, points or exercise', target
        USING ERRCODE = 'check_violation';
    END IF;
    IF value_sum <> activity_row."total_grade" THEN
      RAISE EXCEPTION 'the question values of activity % add up to %, not %', target, value_sum, activity_row."total_grade"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT count(*) INTO misplaced FROM "class_activity_questions"
      WHERE "activity_id" = target
        AND ("value" IS NOT NULL OR "difficulty" IS NULL OR "points" IS NULL OR "source_exercise_id" IS NULL);
    IF misplaced > 0 THEN
      RAISE EXCEPTION 'the questions of exercise activity % need an exercise, its difficulty and points, and no value', target
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- K3: an ASSIGNMENT has only attempt 1; an EXERCISE attempt n > 1 needs attempt n − 1 of the same
-- student concluded (so attempt 1 concluded is the student's first conclusion, a fact of the data).
CREATE FUNCTION "activity_attempts_numbering"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_type "class_activity_type";
BEGIN
  SELECT "type" INTO activity_type FROM "class_activities" WHERE "id" = NEW."activity_id";
  IF NEW."number" = 1 THEN
    RETURN NEW;
  END IF;
  IF activity_type <> 'EXERCISE' THEN
    RAISE EXCEPTION 'activity % takes a single attempt per student', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "activity_attempts"
    WHERE "activity_id" = NEW."activity_id" AND "student_user_id" = NEW."student_user_id"
      AND "number" = NEW."number" - 1 AND "status" = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'attempt % of activity % needs attempt % concluded', NEW."number", NEW."activity_id", NEW."number" - 1
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attempts_numbering"
  BEFORE INSERT ON "activity_attempts"
  FOR EACH ROW EXECUTE FUNCTION "activity_attempts_numbering"();

-- K3: `completed_at` is set iff the attempt is a concluded EXERCISE attempt, and never changes.
CREATE FUNCTION "activity_attempts_completion"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_type "class_activity_type";
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."completed_at" IS NOT NULL AND NEW."completed_at" IS DISTINCT FROM OLD."completed_at" THEN
    RAISE EXCEPTION 'the conclusion of attempt % is immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "type" INTO activity_type FROM "class_activities" WHERE "id" = NEW."activity_id";
  IF (NEW."completed_at" IS NOT NULL) <> (activity_type = 'EXERCISE' AND NEW."status" = 'SUBMITTED') THEN
    RAISE EXCEPTION 'attempt % has a conclusion time iff it is a concluded exercise attempt', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attempts_completion"
  BEFORE INSERT OR UPDATE ON "activity_attempts"
  FOR EACH ROW EXECUTE FUNCTION "activity_attempts_completion"();

-- K5: an EXERCISE attempt is concluded, never submitted or graded.
CREATE FUNCTION "activity_grading_only_assignment"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "class_activities" WHERE "id" = NEW."activity_id" AND "type" = 'EXERCISE') THEN
    RAISE EXCEPTION '% of exercise activity % are not accepted', TG_TABLE_NAME, NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_submissions_only_assignment"
  BEFORE INSERT ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "activity_grading_only_assignment"();

CREATE TRIGGER "activity_question_gradings_only_assignment"
  BEFORE INSERT ON "activity_question_gradings"
  FOR EACH ROW EXECUTE FUNCTION "activity_grading_only_assignment"();

-- K6: a result belongs to a concluded attempt, carries the activity's class and the question's
-- exercise, and only attempt 1 holds a scoring row.
CREATE FUNCTION "exercise_question_results_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attempt_row RECORD;
  question_exercise UUID;
  activity_class UUID;
BEGIN
  SELECT "number", "status" INTO attempt_row FROM "activity_attempts" WHERE "id" = NEW."attempt_id";
  IF attempt_row."status" IS DISTINCT FROM 'SUBMITTED' THEN
    RAISE EXCEPTION 'attempt % is not concluded', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."scoring" AND attempt_row."number" <> 1 THEN
    RAISE EXCEPTION 'only attempt 1 scores (attempt % is number %)', NEW."attempt_id", attempt_row."number"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "source_exercise_id" INTO question_exercise FROM "class_activity_questions" WHERE "id" = NEW."question_id";
  SELECT "class_id" INTO activity_class FROM "class_activities" WHERE "id" = NEW."activity_id";
  IF NEW."source_exercise_id" IS DISTINCT FROM question_exercise OR NEW."class_id" IS DISTINCT FROM activity_class THEN
    RAISE EXCEPTION 'result of question % must carry its exercise and its activity''s class', NEW."question_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_question_results_insert"
  BEFORE INSERT ON "exercise_question_results"
  FOR EACH ROW EXECUTE FUNCTION "exercise_question_results_insert"();

-- K6, K8: results are never deleted; only the teacher's mark changes, and only on the scoring row
-- of an open answer or code question.
CREATE FUNCTION "exercise_question_results_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  question_kind "activity_question_type";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'the result of question % in attempt % cannot be deleted', OLD."question_id", OLD."attempt_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."question_id" IS DISTINCT FROM OLD."question_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."question_points" IS DISTINCT FROM OLD."question_points"
     OR NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."source_exercise_id" IS DISTINCT FROM OLD."source_exercise_id"
     OR NEW."scoring" IS DISTINCT FROM OLD."scoring"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'only the mark of the result of question % can change', OLD."question_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "type" INTO question_kind FROM "class_activity_questions" WHERE "id" = OLD."question_id";
  IF NOT OLD."scoring" OR question_kind = 'MULTIPLE_CHOICE' THEN
    RAISE EXCEPTION 'the result of question % is not marked by the teacher', OLD."question_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_question_results_fixed_columns"
  BEFORE UPDATE OR DELETE ON "exercise_question_results"
  FOR EACH ROW EXECUTE FUNCTION "exercise_question_results_fixed_columns"();

-- Reference data: permissions of specs/013-exercise-points-ranking/contracts/permissions.md. Idempotent.
INSERT INTO "permissions" ("key", "description") VALUES
  ('exercicios.corrigir',      'Marcar como certas ou erradas as respostas de exercícios das próprias turmas'),
  ('ranking.visualizar',       'Ver o ranking de pontos das próprias turmas'),
  ('ranking.turma.visualizar', 'Ver o ranking de pontos das turmas em que está matriculado')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'exercicios.corrigir'),
  ('TEACHER', 'ranking.visualizar'),
  ('STUDENT', 'ranking.turma.visualizar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;

-- K17 (Q3 = A): the 012 EXERCISE activities become practice without keeping grades. Their gradings,
-- submissions, answers and attempts go; grade, deadline, late policy and release become NULL; the
-- questions lose their value and take the difficulty and points of their exercise. The 012
-- immutability triggers are off only for these statements; audit rows stay as history.
ALTER TABLE "activity_submissions" DISABLE TRIGGER "activity_submissions_fixed_columns";
ALTER TABLE "activity_answers" DISABLE TRIGGER "activity_answers_open_attempt";
ALTER TABLE "class_activities" DISABLE TRIGGER "class_activities_fixed_columns";
ALTER TABLE "class_activity_questions" DISABLE TRIGGER "class_activity_questions_immutable";

DELETE FROM "activity_question_gradings"
  WHERE "activity_id" IN (SELECT "id" FROM "class_activities" WHERE "type" = 'EXERCISE');
DELETE FROM "activity_submissions"
  WHERE "activity_id" IN (SELECT "id" FROM "class_activities" WHERE "type" = 'EXERCISE');
DELETE FROM "activity_answers"
  WHERE "activity_id" IN (SELECT "id" FROM "class_activities" WHERE "type" = 'EXERCISE');
DELETE FROM "activity_attempts"
  WHERE "activity_id" IN (SELECT "id" FROM "class_activities" WHERE "type" = 'EXERCISE');

UPDATE "class_activities"
  SET "total_grade" = NULL, "deadline" = NULL, "late_policy" = NULL,
      "result_released_at" = NULL, "result_released_by_id" = NULL
  WHERE "type" = 'EXERCISE';

UPDATE "class_activity_questions" q
  SET "value" = NULL,
      "difficulty" = e."difficulty",
      "points" = CASE e."difficulty" WHEN 'BASIC' THEN 15 WHEN 'INTERMEDIATE' THEN 30 WHEN 'ADVANCED' THEN 60 END
  FROM "class_activities" a, "exercises" e
  WHERE q."activity_id" = a."id" AND a."type" = 'EXERCISE' AND e."id" = q."source_exercise_id";

ALTER TABLE "activity_submissions" ENABLE TRIGGER "activity_submissions_fixed_columns";
ALTER TABLE "activity_answers" ENABLE TRIGGER "activity_answers_open_attempt";
ALTER TABLE "class_activities" ENABLE TRIGGER "class_activities_fixed_columns";
ALTER TABLE "class_activity_questions" ENABLE TRIGGER "class_activity_questions_immutable";

ALTER TABLE "class_activities" VALIDATE CONSTRAINT "class_activities_type_fields_chk";
