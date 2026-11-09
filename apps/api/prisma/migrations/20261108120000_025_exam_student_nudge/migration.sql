-- 025 — Aviso discreto do professor na prova (specs/025-exam-student-nudge/data-model.md, research N1, N2,
-- N4). The teacher's bell in the app sends one student a fixed warning (its text lives only in the web); one
-- pending per attempt, only on an exam attempt still running (in progress, not held, not paused). Only the
-- student's dismissal changes it, once; it leaves only with its attempt. Nothing of 018/024 changes shape.

-- CreateTable
CREATE TABLE "exam_nudges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "sent_by_user_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    "dismissed_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_nudges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_nudges_attempt_sent" ON "exam_nudges"("attempt_id", "sent_at");

-- AddForeignKey
ALTER TABLE "exam_nudges" ADD CONSTRAINT "exam_nudges_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "activity_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_nudges" ADD CONSTRAINT "exam_nudges_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_nudges" ADD CONSTRAINT "exam_nudges_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Rules (data-model.md) ───────────────────────────────────────────────────────────────────

-- One pending warning per attempt (N1); a dismissed one frees the bell again.
CREATE UNIQUE INDEX "exam_nudges_one_pending" ON "exam_nudges"("attempt_id") WHERE "dismissed_at" IS NULL;

ALTER TABLE "exam_nudges" ADD CONSTRAINT "exam_nudges_dismissed_chk"
  CHECK ("dismissed_at" IS NULL OR "dismissed_at" >= "sent_at");

-- A warning goes only to an EXAM attempt in progress, of the same activity, not held and not paused, and it
-- is born pending. The service checks first with the injected clock (409 EXAM_NUDGE_NOT_ALLOWED); this is
-- the backstop.
CREATE FUNCTION "exam_nudges_insert_valid"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attempt RECORD;
BEGIN
  IF NEW."dismissed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'exam_nudges: a warning is born pending (attempt %)', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT a."status", a."activity_id", ca."type" INTO attempt
    FROM "activity_attempts" a JOIN "class_activities" ca ON ca."id" = a."activity_id"
    WHERE a."id" = NEW."attempt_id";
  IF NOT FOUND OR attempt."type" <> 'EXAM' OR attempt."activity_id" <> NEW."activity_id" THEN
    RAISE EXCEPTION 'exam_nudges: attempt % is not an exam attempt of activity %', NEW."attempt_id", NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt."status" <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'exam_nudges: attempt % is not in progress', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "exam_attempt_holds" WHERE "attempt_id" = NEW."attempt_id" AND "resolution" IS NULL) THEN
    RAISE EXCEPTION 'exam_nudges: attempt % is on hold', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "attempt_pauses" WHERE "attempt_id" = NEW."attempt_id" AND "released_at" IS NULL) THEN
    RAISE EXCEPTION 'exam_nudges: attempt % is paused', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_nudges_insert_valid"
  BEFORE INSERT ON "exam_nudges"
  FOR EACH ROW EXECUTE FUNCTION "exam_nudges_insert_valid"();

-- Only the student's dismissal changes a warning: `dismissed_at` from NULL to a value, once.
CREATE FUNCTION "exam_nudges_update_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."sent_by_user_id" IS DISTINCT FROM OLD."sent_by_user_id"
     OR NEW."sent_at" IS DISTINCT FROM OLD."sent_at"
     OR OLD."dismissed_at" IS NOT NULL
     OR NEW."dismissed_at" IS NULL THEN
    RAISE EXCEPTION 'exam_nudges: only dismissed_at changes, once, from NULL to a value (warning %)', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_nudges_update_guard"
  BEFORE UPDATE ON "exam_nudges"
  FOR EACH ROW EXECUTE FUNCTION "exam_nudges_update_guard"();

-- A warning leaves only with its attempt (the FK's cascade runs inside a trigger, depth > 1).
CREATE FUNCTION "exam_nudges_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'exam_nudges: a warning leaves only with its attempt (warning %)', OLD."id"
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "exam_nudges_no_delete"
  BEFORE DELETE ON "exam_nudges"
  FOR EACH ROW EXECUTE FUNCTION "exam_nudges_no_delete"();

-- ── Permission (contracts/permissions.md, research N4) ─────────────────────────────────────

INSERT INTO "permissions" ("key", "description") VALUES
  ('provas.avisos.enviar', 'Enviar aviso discreto a um aluno durante a prova')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'provas.avisos.enviar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
