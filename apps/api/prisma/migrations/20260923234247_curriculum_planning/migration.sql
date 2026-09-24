-- CreateEnum
CREATE TYPE "subject_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "syllabus_media_type" AS ENUM ('PDF', 'DOCX', 'PNG', 'JPEG');

-- CreateEnum
CREATE TYPE "syllabus_processing_status" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "syllabus_failure_category" AS ENUM ('UNREADABLE', 'TIMEOUT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "syllabus_extraction_result" AS ENUM ('TEXT', 'NO_TEXT');

-- CreateEnum
CREATE TYPE "syllabus_revision_status" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "syllabus_revision_source" AS ENUM ('EXTRACTION', 'MANUAL', 'REVISION');

-- CreateEnum
CREATE TYPE "class_meeting_status" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "class_plan_status" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "topic_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "topic_origin" AS ENUM ('MANUAL', 'GENERATED');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "ends_on" DATE,
ADD COLUMN     "starts_on" DATE,
ADD COLUMN     "subject_id" UUID;

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "subject_status" NOT NULL DEFAULT 'ACTIVE',
    "search_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bytes" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "media_type" "syllabus_media_type" NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" BYTEA NOT NULL,
    "page_count" INTEGER,
    "processing_status" "syllabus_processing_status" NOT NULL DEFAULT 'UPLOADED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_expires_at" TIMESTAMPTZ(6),
    "failure_category" "syllabus_failure_category",
    "extraction_result" "syllabus_extraction_result",
    "extraction" JSONB,
    "extractor_version" INTEGER,
    "processed_at" TIMESTAMPTZ(6),
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "syllabus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "syllabus_revision_status" NOT NULL,
    "source" "syllabus_revision_source" NOT NULL,
    "based_on_revision_id" UUID,
    "title" TEXT,
    "syllabus_text" TEXT,
    "competency_text" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "syllabus_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,

    CONSTRAINT "syllabus_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "origin_item_id" UUID,

    CONSTRAINT "syllabus_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_meetings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "meeting_date" DATE NOT NULL,
    "status" "class_meeting_status" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "syllabus_revision_id" UUID NOT NULL,
    "status" "class_plan_status" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "meeting_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "origin" "topic_origin" NOT NULL,
    "status" "topic_status" NOT NULL,
    "status_before_archive" "topic_status",
    "merged_into_topic_id" UUID,
    "split_from_topic_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_syllabus_items" (
    "topic_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_syllabus_items_pkey" PRIMARY KEY ("topic_id","item_id")
);

-- CreateIndex
CREATE INDEX "subjects_teacher_id_status_name_idx" ON "subjects"("teacher_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_documents_file_id_key" ON "syllabus_documents"("file_id");

-- CreateIndex
CREATE INDEX "syllabus_documents_processing_status_next_attempt_at_idx" ON "syllabus_documents"("processing_status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_documents_subject_id_version_key" ON "syllabus_documents"("subject_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_documents_subject_id_sha256_key" ON "syllabus_documents"("subject_id", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_revisions_document_id_number_key" ON "syllabus_revisions"("document_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_groups_revision_id_position_key" ON "syllabus_groups"("revision_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_groups_id_revision_id_key" ON "syllabus_groups"("id", "revision_id");

-- CreateIndex
CREATE INDEX "syllabus_items_revision_id_idx" ON "syllabus_items"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_items_group_id_position_key" ON "syllabus_items"("group_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "class_meetings_class_id_meeting_date_key" ON "class_meetings"("class_id", "meeting_date");

-- CreateIndex
CREATE UNIQUE INDEX "class_plans_class_id_key" ON "class_plans"("class_id");

-- CreateIndex
CREATE INDEX "class_plans_syllabus_revision_id_idx" ON "class_plans"("syllabus_revision_id");

-- CreateIndex
CREATE INDEX "topics_plan_id_status_position_idx" ON "topics"("plan_id", "status", "position");

-- CreateIndex
CREATE INDEX "topics_meeting_id_idx" ON "topics"("meeting_id");

-- CreateIndex (hand-edited: a deferrable constraint instead of a plain unique index, so reordering
-- and splitting can shift positions inside one transaction; same name as Prisma's @@unique)
ALTER TABLE "topics" ADD CONSTRAINT "topics_plan_id_position_key" UNIQUE ("plan_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE INDEX "topic_syllabus_items_item_id_idx" ON "topic_syllabus_items"("item_id");

-- CreateIndex
CREATE INDEX "classes_subject_id_idx" ON "classes"("subject_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "syllabus_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_based_on_revision_id_fkey" FOREIGN KEY ("based_on_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_groups" ADD CONSTRAINT "syllabus_groups_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_group_id_revision_id_fkey" FOREIGN KEY ("group_id", "revision_id") REFERENCES "syllabus_groups"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_origin_item_id_fkey" FOREIGN KEY ("origin_item_id") REFERENCES "syllabus_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_meetings" ADD CONSTRAINT "class_meetings_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_plans" ADD CONSTRAINT "class_plans_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_plans" ADD CONSTRAINT "class_plans_syllabus_revision_id_fkey" FOREIGN KEY ("syllabus_revision_id") REFERENCES "syllabus_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "class_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "class_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_merged_into_topic_id_fkey" FOREIGN KEY ("merged_into_topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_split_from_topic_id_fkey" FOREIGN KEY ("split_from_topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_syllabus_items" ADD CONSTRAINT "topic_syllabus_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_syllabus_items" ADD CONSTRAINT "topic_syllabus_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "syllabus_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Manual additions (rules Prisma cannot express — specs/004-syllabus-planning/data-model.md)
-- ---------------------------------------------------------------------------

-- Subject name stored trimmed, unique per teacher ignoring case (FR-002).
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_name_trimmed_chk" CHECK ("name" = btrim("name") AND "name" <> '');
CREATE UNIQUE INDEX "subjects_teacher_name_key" ON "subjects" ("teacher_id", lower("name"));

-- Class period: both dates or neither, and the end not before the start.
ALTER TABLE "classes" ADD CONSTRAINT "classes_period_dates_chk"
  CHECK (("starts_on" IS NULL) = ("ends_on" IS NULL) AND "ends_on" >= "starts_on");

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_chk" CHECK ("size_bytes" = octet_length("bytes"));
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_sha256_chk" CHECK (octet_length("sha256") = 32);
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_sha256_chk" CHECK (octet_length("sha256") = 32);

-- Processing worker (E7): rows whose lease expired are claimed again.
CREATE INDEX "syllabus_documents_processing_lease_idx"
  ON "syllabus_documents" ("lease_expires_at") WHERE "processing_status" = 'PROCESSING';

-- At most one draft revision per document.
CREATE UNIQUE INDEX "syllabus_revisions_draft_document_key"
  ON "syllabus_revisions" ("document_id") WHERE "status" = 'DRAFT';

ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_confirmed_chk"
  CHECK (("confirmed_at" IS NULL) = ("confirmed_by_id" IS NULL)
     AND ("status" = 'CONFIRMED') = ("confirmed_at" IS NOT NULL));

ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_based_on_chk"
  CHECK (("source" = 'REVISION') = ("based_on_revision_id" IS NOT NULL));

ALTER TABLE "topics" ADD CONSTRAINT "topics_archived_chk"
  CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));

-- Immutability (FR-010, SC-004). Tests truncate with session_replication_role = replica, which
-- skips these row triggers.

-- The original file never changes.
CREATE FUNCTION "stored_files_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stored_files is immutable (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "stored_files_immutable"
  BEFORE UPDATE OR DELETE ON "stored_files"
  FOR EACH ROW EXECUTE FUNCTION "stored_files_immutable"();

-- A confirmed revision never changes. The DRAFT → CONFIRMED update itself passes (OLD is DRAFT).
CREATE FUNCTION "syllabus_revisions_confirmed_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'CONFIRMED' THEN
    RAISE EXCEPTION 'confirmed syllabus revision is immutable (% refused)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "syllabus_revisions_confirmed_immutable"
  BEFORE UPDATE OR DELETE ON "syllabus_revisions"
  FOR EACH ROW EXECUTE FUNCTION "syllabus_revisions_confirmed_immutable"();

-- Groups and items of a confirmed revision cannot be added, changed or removed. FOR SHARE makes a
-- concurrent confirmation wait for (or block) the draft write.
CREATE FUNCTION "syllabus_content_confirmed_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  revision_status "syllabus_revision_status";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO revision_status FROM "syllabus_revisions" WHERE "id" = OLD."revision_id" FOR SHARE;
    IF revision_status = 'CONFIRMED' THEN
      RAISE EXCEPTION '% of a confirmed syllabus revision is immutable (% refused)', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO revision_status FROM "syllabus_revisions" WHERE "id" = NEW."revision_id" FOR SHARE;
    IF revision_status = 'CONFIRMED' THEN
      RAISE EXCEPTION '% of a confirmed syllabus revision is immutable (% refused)', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "syllabus_groups_confirmed_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "syllabus_groups"
  FOR EACH ROW EXECUTE FUNCTION "syllabus_content_confirmed_immutable"();

CREATE TRIGGER "syllabus_items_confirmed_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "syllabus_items"
  FOR EACH ROW EXECUTE FUNCTION "syllabus_content_confirmed_immutable"();

-- Reference data: permissions of specs/004-syllabus-planning/contracts/permissions.md.
-- Idempotent. Only TEACHER receives them.
INSERT INTO "permissions" ("key", "description") VALUES
  ('disciplinas.visualizar',        'Listar e ver as próprias disciplinas'),
  ('disciplinas.criar',             'Criar disciplina'),
  ('disciplinas.editar',            'Editar, desativar e reativar as próprias disciplinas'),
  ('ementas.enviar',                'Enviar ementa e pedir novo processamento'),
  ('ementas.visualizar',            'Ver e baixar documentos, conteúdo extraído e revisões'),
  ('ementas.revisar',               'Criar, editar e confirmar revisões do conteúdo'),
  ('calendario.gerenciar',          'Marcar e desmarcar encontros das próprias turmas'),
  ('planejamento.visualizar',       'Ver encontros, planejamento, tópicos e cobertura'),
  ('planejamento.editar',           'Escolher a ementa usada, criar, editar, juntar, dividir, reordenar, arquivar e restaurar tópicos'),
  ('planejamento.alterar_situacao', 'Confirmar, reabrir, iniciar e arquivar o planejamento')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'disciplinas.visualizar'),
  ('TEACHER', 'disciplinas.criar'),
  ('TEACHER', 'disciplinas.editar'),
  ('TEACHER', 'ementas.enviar'),
  ('TEACHER', 'ementas.visualizar'),
  ('TEACHER', 'ementas.revisar'),
  ('TEACHER', 'calendario.gerenciar'),
  ('TEACHER', 'planejamento.visualizar'),
  ('TEACHER', 'planejamento.editar'),
  ('TEACHER', 'planejamento.alterar_situacao')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
