-- 016 — Attendance-gated release (specs/016-attendance-gated-release/data-model.md, research M2, M3,
-- M4, M6, M7). A work applied from now on is released per student by the teacher's attendance
-- (`release_mode = PRESENT_ONLY`); exercises and works applied before stay `ALL_ENROLLED`. During the
-- attempt the student declares a room exit, or the teacher pauses them: an `attempt_pauses` row that
-- only the teacher releases. PAUSED, a pause's end and its duration are derived on read, never stored.

-- CreateEnum
CREATE TYPE "activity_release_mode" AS ENUM ('ALL_ENROLLED', 'PRESENT_ONLY');

-- CreateEnum
CREATE TYPE "attempt_pause_initiator" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "attempt_pause_reason" AS ENUM ('BATHROOM', 'WATER', 'PHONE', 'OTHER', 'TEACHER');

-- AlterTable: existing rows are ALL_ENROLLED, so works applied before 016 stay visible (M2).
ALTER TABLE "class_activities" ADD COLUMN "release_mode" "activity_release_mode" NOT NULL DEFAULT 'ALL_ENROLLED';

-- CreateTable
CREATE TABLE "activity_attendances" (
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL,
    "marked_by_id" UUID NOT NULL,

    CONSTRAINT "activity_attendances_pkey" PRIMARY KEY ("activity_id","student_user_id")
);

-- CreateTable
CREATE TABLE "attempt_pauses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "initiated_by" "attempt_pause_initiator" NOT NULL,
    "reason" "attempt_pause_reason" NOT NULL,
    "note" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "started_by_id" UUID NOT NULL,
    "released_at" TIMESTAMPTZ(6),
    "released_by_id" UUID,

    CONSTRAINT "attempt_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_attendances_class_id_idx" ON "activity_attendances"("class_id");

-- CreateIndex: the room view and the roster read the pauses of an activity.
CREATE INDEX "attempt_pauses_activity_id_released_at_idx" ON "attempt_pauses"("activity_id", "released_at");

-- CreateIndex: one open pause per attempt (M6); also the lookup of every write refusal.
CREATE UNIQUE INDEX "attempt_pauses_one_open" ON "attempt_pauses"("attempt_id") WHERE "released_at" IS NULL;

-- AddForeignKey
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: the pause is of an attempt of that activity and of its student.
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_attempt_id_activity_id_student_user_id_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- M2: only a work (ASSIGNMENT) waits for the attendance; an EXERCISE is always ALL_ENROLLED (FR-007).
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_release_mode_chk"
  CHECK ("type" = 'ASSIGNMENT' OR "release_mode" = 'ALL_ENROLLED');

-- M6: the reason `TEACHER` exactly when the teacher paused; the note only with "Outro", 1–200
-- characters; the release and who released it set together.
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_reason_chk"
  CHECK (("initiated_by" = 'TEACHER') = ("reason" = 'TEACHER'));
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_note_chk"
  CHECK ("note" IS NULL OR ("reason" = 'OTHER' AND char_length("note") BETWEEN 1 AND 200));
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_released_chk"
  CHECK (("released_at" IS NULL) = ("released_by_id" IS NULL));

-- The class, type, grade, source and release mode of an activity never change; the mode and the AI
-- help change only while no student has started it (015 F2). Replaces the 015 function; its trigger stays.
CREATE OR REPLACE FUNCTION "class_activities_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."teacher_id" IS DISTINCT FROM OLD."teacher_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."total_grade" IS DISTINCT FROM OLD."total_grade"
     OR NEW."question_count" IS DISTINCT FROM OLD."question_count"
     OR NEW."source_work_id" IS DISTINCT FROM OLD."source_work_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."release_mode" IS DISTINCT FROM OLD."release_mode" THEN
    RAISE EXCEPTION 'the class, type, grade, source and release mode of activity % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."execution_mode" IS DISTINCT FROM OLD."execution_mode"
      OR NEW."ai_help_allowance" IS DISTINCT FROM OLD."ai_help_allowance")
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the mode and AI help of activity % are fixed once a student started', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CANCELLED' AND NEW."status" <> 'CANCELLED'
     OR OLD."status" = 'CLOSED' AND NEW."status" = 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % cannot go from % to %', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- M3: a presence is of an ACTIVE PRESENT_ONLY work of an ACTIVE class, for a student with an ACTIVE
-- enrollment in that class. Tests truncate with session_replication_role = replica, which skips it.
CREATE FUNCTION "activity_attendances_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_class UUID;
  activity_mode "activity_release_mode";
  activity_status "class_activity_status";
  class_status "class_status";
BEGIN
  SELECT a."class_id", a."release_mode", a."status", c."status"
    INTO activity_class, activity_mode, activity_status, class_status
    FROM "class_activities" a JOIN "classes" c ON c."id" = a."class_id"
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
    SELECT 1 FROM "enrollments"
    WHERE "class_id" = NEW."class_id" AND "student_user_id" = NEW."student_user_id" AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'student % has no active enrollment in class %', NEW."student_user_id", NEW."class_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attendances_insert"
  BEFORE INSERT ON "activity_attendances"
  FOR EACH ROW EXECUTE FUNCTION "activity_attendances_insert"();

-- M3: a presence is inserted or deleted, never edited; it is deleted only while the student has no
-- attempt (the service checks first, under FOR UPDATE of the presences; the start trigger below
-- reads the presence FOR SHARE, so a delete and a start never both win).
CREATE FUNCTION "activity_attendances_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'the attendance of student % in activity % is never updated', OLD."student_user_id", OLD."activity_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "activity_attempts"
    WHERE "activity_id" = OLD."activity_id" AND "student_user_id" = OLD."student_user_id"
  ) THEN
    RAISE EXCEPTION 'student % already started activity %: the attendance stays', OLD."student_user_id", OLD."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "activity_attendances_guard"
  BEFORE UPDATE OR DELETE ON "activity_attendances"
  FOR EACH ROW EXECUTE FUNCTION "activity_attendances_guard"();

-- M4: only a student marked present starts a PRESENT_ONLY work, even through a path that forgot the
-- visibility clause.
CREATE FUNCTION "activity_attempts_presence"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "class_activities" WHERE "id" = NEW."activity_id" AND "release_mode" = 'PRESENT_ONLY')
     AND NOT EXISTS (
       SELECT 1 FROM "activity_attendances"
       WHERE "activity_id" = NEW."activity_id" AND "student_user_id" = NEW."student_user_id"
       FOR SHARE
     ) THEN
    RAISE EXCEPTION 'student % is not present in activity %', NEW."student_user_id", NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attempts_presence"
  BEFORE INSERT ON "activity_attempts"
  FOR EACH ROW EXECUTE FUNCTION "activity_attempts_presence"();

-- M6: a pause opens only on an IN_PROGRESS attempt of an ACTIVE PRESENT_ONLY work, and opens open.
CREATE FUNCTION "attempt_pauses_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  activity_mode "activity_release_mode";
  activity_status "class_activity_status";
  attempt_status "activity_attempt_status";
BEGIN
  SELECT a."release_mode", a."status", t."status" INTO activity_mode, activity_status, attempt_status
    FROM "activity_attempts" t JOIN "class_activities" a ON a."id" = t."activity_id"
    WHERE t."id" = NEW."attempt_id";
  IF activity_mode IS DISTINCT FROM 'PRESENT_ONLY' THEN
    RAISE EXCEPTION 'activity % does not take attendance: no pause', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF activity_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'activity % is not active: no pause', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no pause', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."released_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a pause starts open (attempt %)', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_pauses_insert"
  BEFORE INSERT ON "attempt_pauses"
  FOR EACH ROW EXECUTE FUNCTION "attempt_pauses_insert"();

-- M6, M7: a pause is never deleted; only its release is written, once, from NULL. Closing,
-- cancelling or accepting ends it by derivation, never by a write.
CREATE FUNCTION "attempt_pauses_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pause % cannot be deleted', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."initiated_by" IS DISTINCT FROM OLD."initiated_by"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
     OR NEW."started_by_id" IS DISTINCT FROM OLD."started_by_id" THEN
    RAISE EXCEPTION 'the start of pause % is immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."released_at" IS NOT NULL THEN
    RAISE EXCEPTION 'pause % was released and is final', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_pauses_transition"
  BEFORE UPDATE OR DELETE ON "attempt_pauses"
  FOR EACH ROW EXECUTE FUNCTION "attempt_pauses_transition"();

-- M6 defense in depth: while the attempt has an open pause and its activity is ACTIVE, no answer,
-- submission, integrity event or help request is written. The teacher's acceptance (012 FR-006b,
-- `accepted_by_id` set) always passes and ends the pause by derivation (M7).
CREATE FUNCTION "attempt_paused_writes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'activity_submissions' THEN
    IF NEW."accepted_by_id" IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "attempt_pauses" p JOIN "class_activities" a ON a."id" = p."activity_id"
    WHERE p."attempt_id" = NEW."attempt_id" AND p."released_at" IS NULL AND a."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'attempt % is paused: % on % refused', NEW."attempt_id", TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_answers_paused"
  BEFORE INSERT OR UPDATE ON "activity_answers"
  FOR EACH ROW EXECUTE FUNCTION "attempt_paused_writes"();

CREATE TRIGGER "activity_submissions_paused"
  BEFORE INSERT ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "attempt_paused_writes"();

CREATE TRIGGER "attempt_integrity_events_paused"
  BEFORE INSERT ON "attempt_integrity_events"
  FOR EACH ROW EXECUTE FUNCTION "attempt_paused_writes"();

CREATE TRIGGER "work_help_requests_paused"
  BEFORE INSERT ON "work_help_requests"
  FOR EACH ROW EXECUTE FUNCTION "attempt_paused_writes"();

-- Reference data: permission of specs/016-attendance-gated-release/contracts/permissions.md. Idempotent.
INSERT INTO "permissions" ("key", "description") VALUES
  ('chamada.registrar', 'Fazer a chamada das atividades das próprias turmas, pausar alunos e liberar o retorno')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'chamada.registrar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
