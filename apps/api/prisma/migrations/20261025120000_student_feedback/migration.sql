-- 020 — Feedback dos Alunos (specs/020-student-feedback/data-model.md, research J2, J3, J5, J8).
-- A student's feedback to the platform ADMIN and the append-only history of its status. The feedback
-- is immutable except its status; only the `student-feedback` retention job deletes it
-- (SET LOCAL devtrack.feedback_purge = 'on'), taking its history with it.

-- CreateEnum
CREATE TYPE "student_feedback_category" AS ENUM ('PROBLEM', 'SUGGESTION', 'PRAISE', 'OTHER');

-- CreateEnum
CREATE TYPE "student_feedback_status" AS ENUM ('RECEIVED', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "student_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "category" "student_feedback_category" NOT NULL,
    "message" TEXT NOT NULL,
    "origin_path" TEXT,
    "status" "student_feedback_status" NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_feedback_status_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feedback_id" UUID NOT NULL,
    "from_status" "student_feedback_status" NOT NULL,
    "to_status" "student_feedback_status" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_feedback_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_feedbacks_student_id_submission_id_key" ON "student_feedbacks"("student_id", "submission_id");

-- CreateIndex
CREATE INDEX "student_feedbacks_student_id_created_at_id_idx" ON "student_feedbacks"("student_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "student_feedbacks_status_created_at_id_idx" ON "student_feedbacks"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "student_feedbacks_created_at_id_idx" ON "student_feedbacks"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "student_feedback_status_changes_feedback_id_changed_at_idx" ON "student_feedback_status_changes"("feedback_id", "changed_at");

-- AddForeignKey
ALTER TABLE "student_feedbacks" ADD CONSTRAINT "student_feedbacks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_feedback_status_changes" ADD CONSTRAINT "student_feedback_status_changes_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "student_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_feedback_status_changes" ADD CONSTRAINT "student_feedback_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- J9: the message as trimmed by the contract, 10–2 000 code points (char_length counts code points).
ALTER TABLE "student_feedbacks" ADD CONSTRAINT "student_feedbacks_message_chk"
  CHECK (char_length("message") BETWEEN 10 AND 2000);

-- J2: a pathname of the portal only — no query, fragment, space or %, never "//" (protocol-relative)
-- nor a ".." segment.
ALTER TABLE "student_feedbacks" ADD CONSTRAINT "student_feedbacks_origin_path_chk"
  CHECK ("origin_path" IS NULL OR (
    char_length("origin_path") <= 200
    AND "origin_path" ~ '^/[A-Za-z0-9/_.-]*$'
    AND "origin_path" !~ '^//'
    AND "origin_path" !~ '(^|/)\.\.(/|$)'
  ));

-- J8: the retention age never precedes the feedback.
ALTER TABLE "student_feedbacks" ADD CONSTRAINT "student_feedbacks_status_changed_at_chk"
  CHECK ("status_changed_at" >= "created_at");

ALTER TABLE "student_feedback_status_changes" ADD CONSTRAINT "student_feedback_status_changes_transition_chk"
  CHECK ("from_status" <> "to_status" AND "to_status" <> 'RECEIVED');

-- J5, FR-012: only the status (and when it changed) may change, and only by an allowed transition
-- (the same table as the pure `feedback-state.ts`).
CREATE FUNCTION "student_feedbacks_guard_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "from" text := OLD."status"::text;
  "to" text := NEW."status"::text;
  "allowed" boolean;
BEGIN
  IF (NEW."id", NEW."student_id", NEW."submission_id", NEW."category", NEW."message", NEW."origin_path", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."student_id", OLD."submission_id", OLD."category", OLD."message", OLD."origin_path", OLD."created_at") THEN
    RAISE EXCEPTION 'student feedback % is immutable except its status', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  "allowed" := CASE "from"
    WHEN 'RECEIVED' THEN "to" IN ('IN_REVIEW', 'RESOLVED', 'ARCHIVED')
    WHEN 'IN_REVIEW' THEN "to" IN ('RESOLVED', 'ARCHIVED')
    WHEN 'RESOLVED' THEN "to" = 'IN_REVIEW'
    WHEN 'ARCHIVED' THEN "to" = 'IN_REVIEW'
    ELSE false
  END;
  IF NOT "allowed" THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: student feedback % cannot go from % to %', OLD."id", "from", "to"
      USING ERRCODE = 'check_violation';
  END IF;
  -- J8: status_changed_at is the retention age; a change never moves it back.
  IF NEW."status_changed_at" < OLD."status_changed_at" THEN
    RAISE EXCEPTION 'status_changed_at of student feedback % cannot move back', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "student_feedbacks_guard_update"
  BEFORE UPDATE ON "student_feedbacks"
  FOR EACH ROW EXECUTE FUNCTION "student_feedbacks_guard_update"();

-- J8: only the retention job deletes a feedback; its history goes with it (ON DELETE CASCADE, under
-- the same flag). The history is append-only otherwise.
CREATE FUNCTION "student_feedbacks_guard_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('devtrack.feedback_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% of % refused (only the student-feedback retention job deletes)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "student_feedbacks_guard_delete"
  BEFORE DELETE ON "student_feedbacks"
  FOR EACH ROW EXECUTE FUNCTION "student_feedbacks_guard_delete"();
CREATE TRIGGER "student_feedbacks_no_truncate"
  BEFORE TRUNCATE ON "student_feedbacks"
  FOR EACH STATEMENT EXECUTE FUNCTION "student_feedbacks_guard_delete"();

CREATE TRIGGER "student_feedback_status_changes_append_only"
  BEFORE UPDATE OR DELETE ON "student_feedback_status_changes"
  FOR EACH ROW EXECUTE FUNCTION "student_feedbacks_guard_delete"();
CREATE TRIGGER "student_feedback_status_changes_no_truncate"
  BEFORE TRUNCATE ON "student_feedback_status_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION "student_feedbacks_guard_delete"();

-- ── Reference data: permissions of specs/020-student-feedback/contracts/permissions.md ───
-- Idempotent. TEACHER and MANAGER receive none (FR-011).
INSERT INTO "permissions" ("key", "description") VALUES
  ('feedbacks.enviar', 'Enviar um feedback sobre a plataforma'),
  ('feedbacks.proprios.listar', 'Ver os próprios feedbacks e a situação de cada um'),
  ('feedbacks.visualizar', 'Ver os feedbacks dos alunos, com o nome e o e-mail de quem enviou'),
  ('feedbacks.alterar_situacao', 'Mudar a situação de um feedback dos alunos')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('STUDENT', 'feedbacks.enviar'),
  ('STUDENT', 'feedbacks.proprios.listar'),
  ('ADMIN', 'feedbacks.visualizar'),
  ('ADMIN', 'feedbacks.alterar_situacao')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
