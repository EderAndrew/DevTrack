-- CreateEnum
CREATE TYPE "class_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "class_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "class_invitation_cancel_reason" AS ENUM ('TEACHER', 'CLASS_ARCHIVED', 'ALREADY_ENROLLED');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterEnum
ALTER TYPE "grant_source" ADD VALUE 'CLASS_INVITATION';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "ra" TEXT,
ADD COLUMN     "status" "student_status" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "period" TEXT,
    "description" TEXT,
    "status" "class_status" NOT NULL DEFAULT 'ACTIVE',
    "status_changed_at" TIMESTAMPTZ(6),
    "search_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "class_invitation_status" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_id" UUID,
    "cancel_reason" "class_invitation_cancel_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_invitation_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invitation_id" UUID NOT NULL,
    "status" "delivery_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_invitation_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL,
    "invitation_id" UUID,
    "removed_at" TIMESTAMPTZ(6),
    "removed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classes_teacher_id_status_created_at_id_idx" ON "classes"("teacher_id", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "classes_teacher_id_academic_year_idx" ON "classes"("teacher_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "class_invitations_token_hash_key" ON "class_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "class_invitations_class_id_status_created_at_id_idx" ON "class_invitations"("class_id", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "class_invitations_email_idx" ON "class_invitations"("email");

-- CreateIndex
CREATE INDEX "class_invitation_deliveries_status_next_attempt_at_idx" ON "class_invitation_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "class_invitation_deliveries_invitation_id_created_at_idx" ON "class_invitation_deliveries"("invitation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "enrollments_class_id_status_idx" ON "enrollments"("class_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_student_user_id_status_idx" ON "enrollments"("student_user_id", "status");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitation_deliveries" ADD CONSTRAINT "class_invitation_deliveries_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "class_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "class_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Manual additions (rules Prisma cannot express — specs/003-class-invitations-enrollment/data-model.md, D8)
-- ---------------------------------------------------------------------------

-- Class code unique per teacher, ignoring case (FR-002).
CREATE UNIQUE INDEX "classes_teacher_code_key" ON "classes" ("teacher_id", upper("code"));

ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_chk" CHECK ("academic_year" BETWEEN 1900 AND 2100);

-- E-mails are stored already normalized (trim + lowercase, as in 001 FR-001).
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_email_normalized_chk" CHECK ("email" = lower(btrim("email")));

-- At most one pending invitation per class and e-mail (FR-012).
CREATE UNIQUE INDEX "class_invitations_pending_class_email_key"
  ON "class_invitations" ("class_id", "email") WHERE "status" = 'PENDING';

ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_accepted_chk"
  CHECK (("status" = 'ACCEPTED') = ("accepted_at" IS NOT NULL));

ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_cancelled_chk"
  CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

ALTER TABLE "class_invitation_deliveries" ADD CONSTRAINT "class_invitation_deliveries_sent_chk"
  CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL));

-- At most one active enrollment per class and student (FR-043).
CREATE UNIQUE INDEX "enrollments_active_class_student_key"
  ON "enrollments" ("class_id", "student_user_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_removed_chk"
  CHECK (("status" = 'REMOVED') = ("removed_at" IS NOT NULL));

-- RA stored normalized (trim + uppercase, normalizeRa) and unique ignoring case (FR-041).
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_ra_normalized_chk" CHECK ("ra" = upper(btrim("ra")));
CREATE UNIQUE INDEX "student_profiles_ra_key" ON "student_profiles" (upper("ra")) WHERE "ra" IS NOT NULL;

-- Reference data: permissions of specs/003-class-invitations-enrollment/contracts/permissions.md.
-- Idempotent. MANAGER and ADMIN receive none of them.
INSERT INTO "permissions" ("key", "description") VALUES
  ('turmas.criar',              'Criar turma própria'),
  ('turmas.visualizar',         'Listar e ver as próprias turmas e os convites delas'),
  ('turmas.editar',             'Editar dados das próprias turmas'),
  ('turmas.alterar_situacao',   'Ativar, inativar e arquivar as próprias turmas'),
  ('turmas.convidar_aluno',     'Convidar aluno por e-mail para turma própria'),
  ('turmas.reenviar_convite',   'Reenviar convite de turma própria'),
  ('turmas.cancelar_convite',   'Cancelar convite de turma própria'),
  ('turmas.visualizar_alunos',  'Listar as matrículas das próprias turmas'),
  ('turmas.remover_aluno',      'Remover matrícula de turma própria'),
  ('turmas.proprias.listar',    'Listar as turmas em que tem matrícula ativa')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'turmas.criar'),
  ('TEACHER', 'turmas.visualizar'),
  ('TEACHER', 'turmas.editar'),
  ('TEACHER', 'turmas.alterar_situacao'),
  ('TEACHER', 'turmas.convidar_aluno'),
  ('TEACHER', 'turmas.reenviar_convite'),
  ('TEACHER', 'turmas.cancelar_convite'),
  ('TEACHER', 'turmas.visualizar_alunos'),
  ('TEACHER', 'turmas.remover_aluno'),
  ('STUDENT', 'turmas.proprias.listar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
