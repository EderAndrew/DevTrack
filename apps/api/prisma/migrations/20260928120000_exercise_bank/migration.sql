-- 010 — Exercise bank (specs/010-exercise-bank/data-model.md, research X2, X13, X17, X19).
-- Rules Prisma can't express (CHECKs, the partial unique index of the correct alternative, the
-- deferred constraint trigger, the origin trigger and the seed rows) are written here by hand.

-- CreateEnum
CREATE TYPE "exercise_type" AS ENUM ('OPEN_ANSWER', 'MULTIPLE_CHOICE', 'CODE');

-- CreateEnum
CREATE TYPE "exercise_difficulty" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "cognitive_objective" AS ENUM ('RECOGNIZE', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'CREATE');

-- CreateEnum
CREATE TYPE "exercise_origin" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "exercise_status" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "programming_languages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programming_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "type" "exercise_type" NOT NULL,
    "difficulty" "exercise_difficulty" NOT NULL,
    "cognitive_objective" "cognitive_objective" NOT NULL,
    "origin" "exercise_origin" NOT NULL,
    "status" "exercise_status" NOT NULL DEFAULT 'DRAFT',
    "archived_from_status" "exercise_status",
    "statement" TEXT NOT NULL,
    "statement_search_key" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "expected_answer" TEXT,
    "instructions" TEXT,
    "starter_code" TEXT,
    "expected_solution" TEXT,
    "language_id" UUID,
    "is_trick_question" BOOLEAN NOT NULL DEFAULT false,
    "syllabus_item_id" UUID,
    "generation_batch_id" UUID,
    "generation_item_id" UUID,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "human_edited" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_alternatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "exercise_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_generation_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "syllabus_item_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "difficulty" "exercise_difficulty" NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "open_answer_quantity" INTEGER NOT NULL,
    "multiple_choice_quantity" INTEGER NOT NULL,
    "code_quantity" INTEGER NOT NULL,
    "trick_question_quantity" INTEGER NOT NULL,
    "language_id" UUID,
    "distribution" TEXT NOT NULL,
    "ai_execution_id" UUID,
    "regenerated_from_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(6),
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "discarded_count" INTEGER NOT NULL DEFAULT 0,
    "archived_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_generation_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "syllabus_revisions" ADD COLUMN "language_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "programming_languages_key_key" ON "programming_languages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "programming_languages_name_key" ON "programming_languages"("name");

-- CreateIndex
CREATE INDEX "exercises_teacher_id_status_updated_at_id_idx" ON "exercises"("teacher_id", "status", "updated_at" DESC, "id");

-- CreateIndex
CREATE INDEX "exercises_teacher_id_syllabus_item_id_idx" ON "exercises"("teacher_id", "syllabus_item_id");

-- CreateIndex
CREATE INDEX "exercises_generation_batch_id_idx" ON "exercises"("generation_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_generation_batch_id_generation_item_id_key" ON "exercises"("generation_batch_id", "generation_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_alternatives_exercise_id_position_key" ON "exercise_alternatives"("exercise_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_generation_batches_ai_execution_id_key" ON "exercise_generation_batches"("ai_execution_id");

-- CreateIndex
CREATE INDEX "exercise_generation_batches_teacher_id_created_at_id_idx" ON "exercise_generation_batches"("teacher_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_generation_batches_teacher_id_idempotency_key_key" ON "exercise_generation_batches"("teacher_id", "idempotency_key");

-- CreateIndex (target of the batches' composite FK: the item belongs to the batch's revision)
CREATE UNIQUE INDEX "syllabus_items_id_revision_id_key" ON "syllabus_items"("id", "revision_id");

-- AddForeignKey
ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_syllabus_item_id_fkey" FOREIGN KEY ("syllabus_item_id") REFERENCES "syllabus_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_generation_batch_id_fkey" FOREIGN KEY ("generation_batch_id") REFERENCES "exercise_generation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_alternatives" ADD CONSTRAINT "exercise_alternatives_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_syllabus_item_id_syllabus_revi_fkey" FOREIGN KEY ("syllabus_item_id", "syllabus_revision_id") REFERENCES "syllabus_items"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_ai_execution_id_fkey" FOREIGN KEY ("ai_execution_id") REFERENCES "ai_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_regenerated_from_id_fkey" FOREIGN KEY ("regenerated_from_id") REFERENCES "exercise_generation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma can't express (research X2).

ALTER TABLE "programming_languages" ADD CONSTRAINT "programming_languages_key_chk"
  CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- One correct alternative per exercise; the deferred trigger below adds "exactly one".
CREATE UNIQUE INDEX "exercise_alternatives_one_correct_key" ON "exercise_alternatives"("exercise_id") WHERE "is_correct";

ALTER TABLE "exercise_alternatives" ADD CONSTRAINT "exercise_alternatives_position_chk" CHECK ("position" >= 0);
ALTER TABLE "exercise_alternatives" ADD CONSTRAINT "exercise_alternatives_text_chk"
  CHECK (char_length("text") BETWEEN 1 AND 2000);

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_statement_chk" CHECK (char_length("statement") BETWEEN 1 AND 10000);
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_explanation_chk" CHECK (char_length("explanation") BETWEEN 1 AND 10000);
-- The fields of each type (FR-003, FR-005): required for that type, absent from the others.
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_open_answer_chk"
  CHECK (("type" = 'OPEN_ANSWER') = ("expected_answer" IS NOT NULL));
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_code_chk"
  CHECK (
    ("type" = 'CODE') = ("instructions" IS NOT NULL)
    AND ("type" = 'CODE') = ("expected_solution" IS NOT NULL)
    AND ("type" = 'CODE') = ("language_id" IS NOT NULL)
    AND ("starter_code" IS NULL OR "type" = 'CODE')
  );
-- A trick question is a multiple-choice exercise (FR-004).
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_trick_question_chk"
  CHECK (NOT "is_trick_question" OR "type" = 'MULTIPLE_CHOICE');
-- The restore target exists exactly while archived, and is never ARCHIVED itself (FR-010).
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_archived_chk"
  CHECK (("status" = 'ARCHIVED') = ("archived_from_status" IS NOT NULL) AND "archived_from_status" IS DISTINCT FROM 'ARCHIVED');
-- An AI_GENERATED exercise always has its topic and its batch; a MANUAL one never has a batch (FR-009).
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_origin_chk"
  CHECK (
    ("origin" = 'AI_GENERATED') = ("generation_batch_id" IS NOT NULL)
    AND ("origin" = 'MANUAL' OR "syllabus_item_id" IS NOT NULL)
    AND ("generation_batch_id" IS NULL) = ("generation_item_id" IS NULL)
  );
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_reviewed_chk"
  CHECK (("reviewed_by_id" IS NULL) = ("reviewed_at" IS NULL));
-- An AI draft reaches the bank only through a person's review (FR-012, FR-013).
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_ai_approved_chk"
  CHECK (NOT ("origin" = 'AI_GENERATED' AND "status" = 'APPROVED') OR ("human_reviewed" AND "reviewed_by_id" IS NOT NULL));
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_version_chk" CHECK ("version" >= 1);

-- Counts of a batch (FR-016, FR-018–FR-020).
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_quantity_chk"
  CHECK (
    "requested_quantity" BETWEEN 3 AND 10
    AND "open_answer_quantity" >= 0 AND "multiple_choice_quantity" >= 0 AND "code_quantity" >= 0
    AND "open_answer_quantity" + "multiple_choice_quantity" + "code_quantity" = "requested_quantity"
  );
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_trick_chk"
  CHECK ("trick_question_quantity" BETWEEN 0 AND 3 AND "trick_question_quantity" <= "multiple_choice_quantity");
-- The language comes from the revision and matters only for code (FR-021).
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_language_chk"
  CHECK (("code_quantity" > 0) = ("language_id" IS NOT NULL));
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_distribution_chk"
  CHECK ("distribution" IN ('AUTO', 'MANUAL'));
ALTER TABLE "exercise_generation_batches" ADD CONSTRAINT "exercise_generation_batches_review_counts_chk"
  CHECK ("approved_count" >= 0 AND "discarded_count" >= 0 AND "archived_count" >= 0);

-- Origin and type never change, even when the exercise is edited (FR-009). Tests truncate with
-- session_replication_role = replica, which skips these row triggers.
CREATE FUNCTION "exercises_origin_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" OR NEW."type" IS DISTINCT FROM OLD."type" THEN
    RAISE EXCEPTION 'exercise origin and type are immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercises_origin_immutable"
  BEFORE UPDATE ON "exercises"
  FOR EACH ROW EXECUTE FUNCTION "exercises_origin_immutable"();

-- At commit, a MULTIPLE_CHOICE exercise has 3–5 alternatives, exactly one correct and no two
-- texts equal after trimming, collapsing spaces and lowercasing; no other type has alternatives
-- (FR-004). Deferred, so an exercise and its alternatives can be written in any order within the
-- transaction; it fires on both tables so an exercise saved without alternatives is refused too.
CREATE FUNCTION "exercise_alternatives_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  exercise_kind "exercise_type";
  total INTEGER;
  correct INTEGER;
  distinct_texts INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'exercises' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."exercise_id";
  ELSE
    target := NEW."exercise_id";
  END IF;

  SELECT "type" INTO exercise_kind FROM "exercises" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL; -- the exercise was deleted with its alternatives
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE "is_correct"),
         count(DISTINCT lower(regexp_replace(btrim("text"), '\s+', ' ', 'g')))
    INTO total, correct, distinct_texts
    FROM "exercise_alternatives" WHERE "exercise_id" = target;

  IF exercise_kind = 'MULTIPLE_CHOICE' THEN
    IF total NOT BETWEEN 3 AND 5 OR correct <> 1 OR distinct_texts <> total THEN
      RAISE EXCEPTION 'multiple choice exercise % needs 3 to 5 distinct alternatives with exactly one correct', target
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF total > 0 THEN
    RAISE EXCEPTION 'exercise % of type % cannot have alternatives', target, exercise_kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "exercise_alternatives_valid"
  AFTER INSERT OR UPDATE OR DELETE ON "exercise_alternatives"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exercise_alternatives_valid"();

CREATE CONSTRAINT TRIGGER "exercises_alternatives_valid"
  AFTER INSERT ON "exercises"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "exercise_alternatives_valid"();

-- Reference data: the programming-language catalog (research X17). Data, never an enum
-- (constitution XXI); aliases are the extra lowercase terms the 007 grounding looks for.
INSERT INTO "programming_languages" ("key", "name", "aliases") VALUES
  ('angular',    'Angular',    ARRAY['angularjs']),
  ('c',          'C',          ARRAY['linguagem c', 'ansi c']),
  ('cpp',        'C++',        ARRAY['c++', 'cpp']),
  ('go',         'Go',         ARRAY['golang']),
  ('html-css',   'HTML & CSS', ARRAY['html', 'css', 'html5', 'css3']),
  ('java',       'Java',       ARRAY[]::TEXT[]),
  ('javascript', 'JavaScript', ARRAY['js', 'ecmascript']),
  ('nest',       'Nest',       ARRAY['nestjs', 'nest.js']),
  ('node',       'Node',       ARRAY['node.js', 'nodejs']),
  ('php',        'PHP',        ARRAY[]::TEXT[]),
  ('python',     'Python',     ARRAY['python3']),
  ('rust',       'Rust',       ARRAY[]::TEXT[]),
  ('typescript', 'TypeScript', ARRAY['ts'])
ON CONFLICT ("key") DO NOTHING;

-- Reference data: permissions of specs/010-exercise-bank/contracts/permissions.md.
-- Idempotent. Only TEACHER receives them.
INSERT INTO "permissions" ("key", "description") VALUES
  ('questoes.visualizar', 'Listar e ver os exercícios e lotes do próprio banco'),
  ('questoes.criar',      'Criar exercícios manualmente, em conjunto ou avulsos'),
  ('questoes.editar',     'Editar, excluir rascunhos, arquivar e restaurar os próprios exercícios'),
  ('questoes.aprovar',    'Aprovar exercícios em rascunho do próprio banco'),
  ('ia.exercicios.gerar', 'Pedir a geração de exercícios com IA a partir de um tópico da ementa')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'questoes.visualizar'),
  ('TEACHER', 'questoes.criar'),
  ('TEACHER', 'questoes.editar'),
  ('TEACHER', 'questoes.aprovar'),
  ('TEACHER', 'ia.exercicios.gerar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
