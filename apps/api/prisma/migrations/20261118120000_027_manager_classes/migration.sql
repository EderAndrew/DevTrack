-- 027 — Turmas do gestor e disciplinas da turma (specs/027-manager-classes/data-model.md, research Q1–Q9).
-- This migration is also the transition (FR-027–FR-030): it runs once, in one transaction (the whole
-- script is one implicit transaction of the simple query protocol), before the new constraints.
--
-- The turma moves to the new table `cohorts` (the MANAGER's); `classes` becomes the disciplina da turma
-- (the teacher's: subject, calendar, own status) and keeps its id, so every pedagogical table of
-- 004–026 stays keyed by `classes.id`. Enrollments and invitations move to the cohort.

-- ---------------------------------------------------------------------------
-- (2) cohorts
-- ---------------------------------------------------------------------------
CREATE TABLE "cohorts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "period" TEXT,
    "description" TEXT,
    "status" "class_status" NOT NULL DEFAULT 'ACTIVE',
    "status_changed_at" TIMESTAMPTZ(6),
    "search_key" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_academic_year_chk" CHECK ("academic_year" BETWEEN 1900 AND 2100);

-- ---------------------------------------------------------------------------
-- (3) one cohort per group of classes with the same academic year and code (ignoring case): the data of
-- the oldest class (created_at, then id), the most open status of the group (ACTIVE > INACTIVE >
-- ARCHIVED), created by the oldest class's teacher. status_changed_at is the latest change among the classes
-- of the group that have that status (the oldest class's own date when the group is that class alone).
-- search_key is name + code of that class, the same the application computed for it (003 D10), so it is copied.
-- ---------------------------------------------------------------------------
WITH "groups" AS (
  SELECT o.*,
         (SELECT CASE min(CASE s."status" WHEN 'ACTIVE' THEN 0 WHEN 'INACTIVE' THEN 1 ELSE 2 END)
                   WHEN 0 THEN 'ACTIVE' WHEN 1 THEN 'INACTIVE' ELSE 'ARCHIVED' END::"class_status"
            FROM "classes" s
           WHERE s."academic_year" = o."academic_year" AND upper(s."code") = upper(o."code")) AS "group_status"
    FROM "classes" o
   WHERE NOT EXISTS (
     SELECT 1 FROM "classes" p
      WHERE p."academic_year" = o."academic_year" AND upper(p."code") = upper(o."code")
        AND (p."created_at", p."id") < (o."created_at", o."id")
   )
)
INSERT INTO "cohorts" ("name", "code", "academic_year", "period", "description", "status", "status_changed_at",
                       "search_key", "created_by_id", "created_at", "updated_at")
SELECT g."name", g."code", g."academic_year", g."period", g."description", g."group_status",
       (SELECT max(s."status_changed_at") FROM "classes" s
         WHERE s."academic_year" = g."academic_year" AND upper(s."code") = upper(g."code") AND s."status" = g."group_status"),
       g."search_key", g."teacher_id", g."created_at", now()
  FROM "groups" g;

-- ---------------------------------------------------------------------------
-- (4) classes.cohort_id; each class keeps its own status (FR-027)
-- ---------------------------------------------------------------------------
ALTER TABLE "classes" ADD COLUMN "cohort_id" UUID;

UPDATE "classes" c
   SET "cohort_id" = k."id"
  FROM "cohorts" k
 WHERE k."academic_year" = c."academic_year" AND upper(k."code") = upper(c."code");

ALTER TABLE "classes" ALTER COLUMN "cohort_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- (5) enrollments → the cohort. A student with more than one ACTIVE enrollment in the same new cohort keeps
-- the oldest; the others end REMOVED with removal_reason MERGED (no row is deleted), each audited
-- (constitution XXIV) by the SYSTEM.
-- ---------------------------------------------------------------------------
ALTER TABLE "enrollments"
  ADD COLUMN "cohort_id" UUID,
  ADD COLUMN "source" "enrollment_source" NOT NULL DEFAULT 'INVITATION',
  ADD COLUMN "enrolled_by_id" UUID,
  ADD COLUMN "removal_reason" "enrollment_removal_reason";

UPDATE "enrollments" e SET "cohort_id" = c."cohort_id" FROM "classes" c WHERE c."id" = e."class_id";

ALTER TABLE "enrollments" ALTER COLUMN "cohort_id" SET NOT NULL;

WITH "duplicates" AS (
  SELECT r."id" FROM (
    SELECT e."id", row_number() OVER (PARTITION BY e."cohort_id", e."student_user_id"
                                      ORDER BY e."enrolled_at", e."created_at", e."id") AS "position"
      FROM "enrollments" e
     WHERE e."status" = 'ACTIVE'
  ) r
  WHERE r."position" > 1
), "removed" AS (
  UPDATE "enrollments" e
     SET "status" = 'REMOVED', "removed_at" = now(), "removal_reason" = 'MERGED', "updated_at" = now()
    FROM "duplicates" d
   WHERE e."id" = d."id"
  RETURNING e."id", e."cohort_id", e."student_user_id"
)
INSERT INTO "audit_events" ("type", "actor_type", "target_type", "target_id", "metadata")
SELECT 'enrollment.removed', 'SYSTEM', 'ENROLLMENT', r."id"::text,
       jsonb_build_object('cohortId', r."cohort_id", 'userId', r."student_user_id", 'reason', 'MERGED')
  FROM "removed" r;

-- ---------------------------------------------------------------------------
-- (6) invitations → the cohort. Two PENDING for the same cohort and e-mail: the one with the latest expiry
-- stays (its link still works), the other ends CANCELLED with cancel_reason MERGED, audited by the SYSTEM;
-- its pending e-mail is retired as a cancellation retires it (017 outbox).
-- ---------------------------------------------------------------------------
ALTER TABLE "class_invitations" ADD COLUMN "cohort_id" UUID;

UPDATE "class_invitations" i SET "cohort_id" = c."cohort_id" FROM "classes" c WHERE c."id" = i."class_id";

ALTER TABLE "class_invitations" ALTER COLUMN "cohort_id" SET NOT NULL;

WITH "duplicates" AS (
  SELECT r."id" FROM (
    SELECT i."id", row_number() OVER (PARTITION BY i."cohort_id", i."email"
                                      ORDER BY i."expires_at" DESC, i."created_at" DESC, i."id" DESC) AS "position"
      FROM "class_invitations" i
     WHERE i."status" = 'PENDING'
  ) r
  WHERE r."position" > 1
), "cancelled" AS (
  UPDATE "class_invitations" i
     SET "status" = 'CANCELLED', "cancelled_at" = now(), "cancel_reason" = 'MERGED', "cancelled_by_id" = NULL,
         "updated_at" = now()
    FROM "duplicates" d
   WHERE i."id" = d."id"
  RETURNING i."id", i."cohort_id"
), "retired" AS (
  UPDATE "mail_deliveries" m
     SET "status" = 'SUPERSEDED', "next_attempt_at" = NULL, "updated_at" = now()
    FROM "cancelled" x
   WHERE m."kind" = 'CLASS_INVITATION' AND m."class_invitation_id" = x."id" AND m."status" = 'PENDING'
  RETURNING m."id"
)
INSERT INTO "audit_events" ("type", "actor_type", "target_type", "target_id", "metadata")
SELECT 'class_invitation.cancelled', 'SYSTEM', 'CLASS_INVITATION', x."id"::text,
       jsonb_build_object('cohortId', x."cohort_id", 'invitationId', x."id", 'reason', 'MERGED')
  FROM "cancelled" x;

-- ---------------------------------------------------------------------------
-- (7) drop what moved, create the new constraints, the view and the function
-- ---------------------------------------------------------------------------
DROP INDEX "classes_teacher_code_key";
ALTER TABLE "classes"
  DROP COLUMN "name",
  DROP COLUMN "code",
  DROP COLUMN "academic_year",
  DROP COLUMN "period",
  DROP COLUMN "description",
  DROP COLUMN "search_key";

-- Drops their FK, the (class_id, status) index and the class-keyed partial UNIQUE too.
ALTER TABLE "enrollments" DROP COLUMN "class_id";
ALTER TABLE "class_invitations" DROP COLUMN "class_id";

-- cohorts: FR-002 code unique per academic year ignoring case; the MANAGER's list; the teacher's directory.
CREATE UNIQUE INDEX "cohorts_year_code_key" ON "cohorts" ("academic_year", upper("code"));
CREATE INDEX "cohorts_status_academic_year_created_at_id_idx"
  ON "cohorts" ("status", "academic_year" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "cohorts_directory_idx" ON "cohorts" ("academic_year" DESC, "name", "id") WHERE "status" = 'ACTIVE';
CREATE INDEX "cohorts_created_by_id_idx" ON "cohorts" ("created_by_id");
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- classes: the disciplina da turma.
CREATE INDEX "classes_cohort_id_idx" ON "classes" ("cohort_id");
ALTER TABLE "classes" ADD CONSTRAINT "classes_cohort_id_fkey"
  FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- FR-018: one disciplina da turma per subject in a cohort (a migrated class without subject is exempt, FR-030).
CREATE UNIQUE INDEX "classes_cohort_subject_key" ON "classes" ("cohort_id", "subject_id") WHERE "subject_id" IS NOT NULL;

-- FR-019: the teacher, the cohort and the subject of a disciplina da turma never change after insert.
CREATE FUNCTION "classes_identity_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."teacher_id" IS DISTINCT FROM OLD."teacher_id"
     OR NEW."cohort_id" IS DISTINCT FROM OLD."cohort_id"
     OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" THEN
    RAISE EXCEPTION 'the teacher, cohort and subject of class % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "classes_identity_immutable"
  BEFORE UPDATE ON "classes"
  FOR EACH ROW EXECUTE FUNCTION "classes_identity_immutable"();

-- enrollments: FR-015 one ACTIVE enrollment per cohort and student; FR-034 who enrolled directly.
CREATE INDEX "enrollments_cohort_id_status_idx" ON "enrollments" ("cohort_id", "status");
CREATE UNIQUE INDEX "enrollments_active_cohort_student_key"
  ON "enrollments" ("cohort_id", "student_user_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_fkey"
  FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_id_fkey"
  FOREIGN KEY ("enrolled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_source_chk"
  CHECK ((("source" = 'DIRECT') = ("enrolled_by_id" IS NOT NULL)) AND ("source" <> 'DIRECT' OR "invitation_id" IS NULL));
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_removal_reason_chk"
  CHECK ("removal_reason" IS NULL OR "status" = 'REMOVED');

-- class_invitations: FR-012 one PENDING per cohort and e-mail.
CREATE INDEX "class_invitations_cohort_id_status_created_at_id_idx"
  ON "class_invitations" ("cohort_id", "status", "created_at" DESC, "id" DESC);
CREATE UNIQUE INDEX "class_invitations_pending_cohort_email_key"
  ON "class_invitations" ("cohort_id", "email") WHERE "status" = 'PENDING';
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_cohort_id_fkey"
  FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Research Q3: "is this student in this class" for every pedagogical reader. Read-only.
CREATE VIEW "class_enrollments" AS
SELECT c."id" AS "class_id", e."id" AS "enrollment_id", e."student_user_id", e."status", e."enrolled_at"
  FROM "classes" c
  JOIN "enrollments" e ON e."cohort_id" = c."cohort_id";

-- FR-023: the effective status of a disciplina da turma is the most restrictive of the cohort's and its own
-- (ARCHIVED > INACTIVE > ACTIVE); derived on every read, never stored. NULL for an unknown class.
CREATE FUNCTION "class_effective_status"("p_class_id" UUID) RETURNS "class_status"
LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN c."status" = 'ARCHIVED' OR k."status" = 'ARCHIVED' THEN 'ARCHIVED'::"class_status"
           WHEN c."status" = 'INACTIVE' OR k."status" = 'INACTIVE' THEN 'INACTIVE'::"class_status"
           ELSE 'ACTIVE'::"class_status"
         END
    FROM "classes" c
    JOIN "cohorts" k ON k."id" = c."cohort_id"
   WHERE c."id" = "p_class_id"
$$;

-- 016 M3, rewritten over the cohort: a presence is of an ACTIVE PRESENT_ONLY work of a class whose effective
-- status is ACTIVE, for a student with an ACTIVE enrollment in the class's cohort.
CREATE OR REPLACE FUNCTION "activity_attendances_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_class UUID;
  activity_mode "activity_release_mode";
  activity_status "class_activity_status";
  class_status "class_status";
BEGIN
  SELECT a."class_id", a."release_mode", a."status", "class_effective_status"(a."class_id")
    INTO activity_class, activity_mode, activity_status, class_status
    FROM "class_activities" a
    WHERE a."id" = NEW."activity_id";
  IF activity_mode IS DISTINCT FROM 'PRESENT_ONLY' THEN
    RAISE EXCEPTION 'activity % does not take attendance', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."class_id" IS DISTINCT FROM activity_class THEN
    RAISE EXCEPTION 'the attendance of activity % must be in its class %', NEW."activity_id", activity_class
      USING ERRCODE = 'check_violation';
  END IF;
  IF activity_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % is not active: no attendance', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF class_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'class % is not active: no attendance', NEW."class_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "class_enrollments"
    WHERE "class_id" = NEW."class_id" AND "student_user_id" = NEW."student_user_id" AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'student % has no active enrollment in class %', NEW."student_user_id", NEW."class_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The seventh e-mail (FR-034) is about an enrollment: its own subject column, as the other kinds (017).
ALTER TABLE "mail_deliveries" ADD COLUMN "enrollment_id" UUID;
CREATE INDEX "mail_deliveries_enrollment_id_created_at_idx" ON "mail_deliveries" ("enrollment_id", "created_at" DESC);
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mail_deliveries" DROP CONSTRAINT "mail_deliveries_subject_chk";
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_subject_chk" CHECK (
  num_nonnulls("class_invitation_id", "invitation_id", "user_id", "admin_bootstrap_id", "enrollment_id") = 1
  AND CASE "kind"
    WHEN 'CLASS_INVITATION' THEN "class_invitation_id" IS NOT NULL
    WHEN 'INVITATION_TEACHER' THEN "invitation_id" IS NOT NULL
    WHEN 'INVITATION_MANAGER' THEN "invitation_id" IS NOT NULL
    WHEN 'VERIFY_EMAIL' THEN "user_id" IS NOT NULL
    WHEN 'PASSWORD_RESET' THEN "user_id" IS NOT NULL
    WHEN 'ADMIN_ACTIVATION' THEN "admin_bootstrap_id" IS NOT NULL
    WHEN 'CLASS_ENROLLMENT_NOTICE' THEN "enrollment_id" IS NOT NULL
  END
);

-- 017 research N7, with the new subject column immutable too.
CREATE OR REPLACE FUNCTION "mail_deliveries_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "from" text := OLD."status"::text;
  "to" text := NEW."status"::text;
  "reason" text := NEW."undelivered_reason"::text;
  "allowed" boolean;
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."class_invitation_id" IS DISTINCT FROM OLD."class_invitation_id"
     OR NEW."invitation_id" IS DISTINCT FROM OLD."invitation_id"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."admin_bootstrap_id" IS DISTINCT FROM OLD."admin_bootstrap_id"
     OR NEW."enrollment_id" IS DISTINCT FROM OLD."enrollment_id" THEN
    RAISE EXCEPTION 'the kind and subject of mail delivery % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF "from" IN ('UNDELIVERED', 'FAILED', 'DISCARDED', 'SUPERSEDED') THEN
    IF (NEW."status", NEW."attempts", NEW."next_attempt_at", NEW."last_error_code", NEW."message_id", NEW."sent_at",
        NEW."delivered_at", NEW."undelivered_at", NEW."undelivered_reason", NEW."discard_reason")
       IS DISTINCT FROM
       (OLD."status", OLD."attempts", OLD."next_attempt_at", OLD."last_error_code", OLD."message_id", OLD."sent_at",
        OLD."delivered_at", OLD."undelivered_at", OLD."undelivered_reason", OLD."discard_reason") THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: mail delivery % is final (%)', OLD."id", "from"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  "allowed" := CASE "from"
    WHEN 'PENDING' THEN "to" IN ('PENDING', 'SENT', 'DELIVERED', 'UNDELIVERED', 'FAILED', 'DISCARDED', 'SUPERSEDED')
    WHEN 'SENT' THEN "to" = 'SENT' OR "to" = 'DELIVERED' OR ("to" = 'UNDELIVERED' AND "reason" IN ('BOUNCED', 'COMPLAINED'))
    WHEN 'DELIVERED' THEN "to" = 'DELIVERED' OR ("to" = 'UNDELIVERED' AND "reason" IN ('BOUNCED', 'COMPLAINED'))
    ELSE false
  END;
  IF NOT "allowed" THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: mail delivery % cannot go from % to %', OLD."id", "from", "to"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- (8) permissions (data-model.md "Permissions", research Q8)
-- ---------------------------------------------------------------------------
UPDATE "permissions" p SET "description" = d."description"
  FROM (VALUES
    ('turmas.criar',              'Criar turma (grupo de alunos do ano letivo)'),
    ('turmas.visualizar',         'Listar e ver as turmas, as disciplinas delas e os convites'),
    ('turmas.editar',             'Editar os dados de uma turma'),
    ('turmas.alterar_situacao',   'Ativar, encerrar e arquivar turmas'),
    ('turmas.convidar_aluno',     'Convidar aluno por e-mail para uma turma'),
    ('turmas.reenviar_convite',   'Reenviar convite de uma turma'),
    ('turmas.cancelar_convite',   'Cancelar convite de uma turma'),
    ('turmas.visualizar_alunos',  'Listar as matrículas de uma turma com o e-mail dos alunos'),
    ('turmas.remover_aluno',      'Encerrar a matrícula de um aluno em uma turma')
  ) AS d ("key", "description")
 WHERE p."key" = d."key";

DELETE FROM "role_permissions" rp
 USING "roles" r, "permissions" p
 WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id" AND r."key" = 'TEACHER'
   AND p."key" IN ('turmas.criar', 'turmas.visualizar', 'turmas.editar', 'turmas.alterar_situacao',
                   'turmas.convidar_aluno', 'turmas.reenviar_convite', 'turmas.cancelar_convite',
                   'turmas.visualizar_alunos', 'turmas.remover_aluno');

INSERT INTO "permissions" ("key", "description") VALUES
  ('turmas.incluir_aluno',                  'Procurar aluno com conta pelo e-mail exato e incluí-lo direto na turma'),
  ('turmas.buscar',                         'Procurar turmas ativas para acrescentar uma disciplina'),
  ('disciplinas_turma.visualizar',          'Listar e ver as próprias disciplinas da turma'),
  ('disciplinas_turma.criar',               'Acrescentar uma disciplina própria a uma turma ativa'),
  ('disciplinas_turma.editar',              'Editar o calendário das próprias disciplinas da turma'),
  ('disciplinas_turma.alterar_situacao',    'Encerrar e arquivar as próprias disciplinas da turma após o calendário'),
  ('disciplinas_turma.visualizar_alunos',   'Ver os alunos das próprias disciplinas da turma (só leitura)')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('MANAGER', 'turmas.criar'), ('ADMIN', 'turmas.criar'),
  ('MANAGER', 'turmas.visualizar'), ('ADMIN', 'turmas.visualizar'),
  ('MANAGER', 'turmas.editar'), ('ADMIN', 'turmas.editar'),
  ('MANAGER', 'turmas.alterar_situacao'), ('ADMIN', 'turmas.alterar_situacao'),
  ('MANAGER', 'turmas.convidar_aluno'), ('ADMIN', 'turmas.convidar_aluno'),
  ('MANAGER', 'turmas.reenviar_convite'), ('ADMIN', 'turmas.reenviar_convite'),
  ('MANAGER', 'turmas.cancelar_convite'), ('ADMIN', 'turmas.cancelar_convite'),
  ('MANAGER', 'turmas.visualizar_alunos'), ('ADMIN', 'turmas.visualizar_alunos'),
  ('MANAGER', 'turmas.remover_aluno'), ('ADMIN', 'turmas.remover_aluno'),
  ('MANAGER', 'turmas.incluir_aluno'), ('ADMIN', 'turmas.incluir_aluno'),
  ('TEACHER', 'turmas.buscar'),
  ('TEACHER', 'disciplinas_turma.visualizar'),
  ('TEACHER', 'disciplinas_turma.criar'),
  ('TEACHER', 'disciplinas_turma.editar'),
  ('TEACHER', 'disciplinas_turma.alterar_situacao'),
  ('TEACHER', 'disciplinas_turma.visualizar_alunos')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- (9) one SYSTEM audit event with the transition's counts and the role-permission changes (constitution
-- XXV). mergedEnrollments/mergedInvitations equal the MERGED events written in (5) and (6).
-- ---------------------------------------------------------------------------
INSERT INTO "audit_events" ("type", "actor_type", "target_type", "metadata")
SELECT 'cohort_transition.applied', 'SYSTEM', 'COHORT_TRANSITION', jsonb_build_object(
  'cohorts', (SELECT count(*) FROM "cohorts"),
  'classes', (SELECT count(*) FROM "classes"),
  'mergedCohorts', (SELECT count(*) FROM (SELECT "cohort_id" FROM "classes" GROUP BY "cohort_id" HAVING count(*) > 1) g),
  'mergedEnrollments', (SELECT count(*) FROM "enrollments" WHERE "removal_reason" = 'MERGED'),
  'mergedInvitations', (SELECT count(*) FROM "class_invitations" WHERE "cancel_reason" = 'MERGED'),
  'permissionsMoved', (
    SELECT jsonb_agg(jsonb_build_object('key', k, 'from', 'TEACHER', 'to', jsonb_build_array('MANAGER', 'ADMIN')) ORDER BY k)
      FROM unnest(ARRAY['turmas.criar', 'turmas.visualizar', 'turmas.editar', 'turmas.alterar_situacao',
                        'turmas.convidar_aluno', 'turmas.reenviar_convite', 'turmas.cancelar_convite',
                        'turmas.visualizar_alunos', 'turmas.remover_aluno']) AS k),
  'permissionsAdded', jsonb_build_array(
    jsonb_build_object('key', 'turmas.incluir_aluno', 'roles', jsonb_build_array('MANAGER', 'ADMIN')),
    jsonb_build_object('key', 'turmas.buscar', 'roles', jsonb_build_array('TEACHER')),
    jsonb_build_object('key', 'disciplinas_turma.visualizar', 'roles', jsonb_build_array('TEACHER')),
    jsonb_build_object('key', 'disciplinas_turma.criar', 'roles', jsonb_build_array('TEACHER')),
    jsonb_build_object('key', 'disciplinas_turma.editar', 'roles', jsonb_build_array('TEACHER')),
    jsonb_build_object('key', 'disciplinas_turma.alterar_situacao', 'roles', jsonb_build_array('TEACHER')),
    jsonb_build_object('key', 'disciplinas_turma.visualizar_alunos', 'roles', jsonb_build_array('TEACHER'))
  )
);
