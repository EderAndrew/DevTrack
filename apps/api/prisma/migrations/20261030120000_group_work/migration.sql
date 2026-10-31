-- 023 — Trabalho individual ou em grupo (specs/023-group-work/data-model.md, research U2–U4, U8, U10).
-- A group shares one attempt: `attempt_participants` lists who takes part (every attempt has its owner's
-- row; a group adds its members), `attempt_groups` holds the leader and the one editor, and the
-- per-student facts point at the participant. Every older attempt stays individual, with its owner's row.

-- ── U2: the format lives on the activity ──────────────────────────────────────────────────────

-- NULL = individual; 2–5 = a group counting the leader, only for a work that takes attendance (FR-001).
ALTER TABLE "class_activities" ADD COLUMN "group_size" SMALLINT;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_group_size_chk"
  CHECK (
    "group_size" IS NULL
    OR ("group_size" BETWEEN 2 AND 5 AND "type" = 'ASSIGNMENT' AND "release_mode" = 'PRESENT_ONLY')
  );

-- Fixed once a student started, like the 015 mode and AI help and the 021 option (the service answers 409 first).
CREATE FUNCTION "class_activities_group_size_fixed"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."group_size" IS DISTINCT FROM OLD."group_size"
     AND EXISTS (SELECT 1 FROM "activity_attempts" WHERE "activity_id" = OLD."id") THEN
    RAISE EXCEPTION 'the group size of activity % is fixed once a student started', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "class_activities_group_size_fixed"
  BEFORE UPDATE OF "group_size" ON "class_activities"
  FOR EACH ROW EXECUTE FUNCTION "class_activities_group_size_fixed"();

-- ── Enums ─────────────────────────────────────────────────────────────────────────────────────

CREATE TYPE "attempt_group_event_kind" AS ENUM ('EDITING_HANDED', 'EDITING_TAKEN_BACK', 'EDITING_RETURNED', 'EDITING_RESET', 'LEADER_CHANGED');
CREATE TYPE "attempt_group_event_reason" AS ENUM ('PAUSED', 'ACCESS_LOST');

-- ── U3: who takes part in an attempt ──────────────────────────────────────────────────────────

CREATE TABLE "attempt_participants" (
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL,
    "added_by_user_id" UUID,

    CONSTRAINT "attempt_participants_pkey" PRIMARY KEY ("attempt_id", "student_user_id")
);

-- Target of the per-student facts' composite FKs (U4).
CREATE UNIQUE INDEX "attempt_participants_attempt_id_activity_id_student_user_id_key"
  ON "attempt_participants"("attempt_id", "activity_id", "student_user_id");
-- FR-008: one participation per attempt number of an activity; also the student-side lookup (U5).
CREATE UNIQUE INDEX "attempt_participants_activity_id_student_user_id_attempt_nu_key"
  ON "attempt_participants"("activity_id", "student_user_id", "attempt_number");

ALTER TABLE "attempt_participants" ADD CONSTRAINT "attempt_participants_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_participants" ADD CONSTRAINT "attempt_participants_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_participants" ADD CONSTRAINT "attempt_participants_attempt_id_added_by_user_id_fkey"
  FOREIGN KEY ("attempt_id", "added_by_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one owner row per existing attempt, joined when it started.
INSERT INTO "attempt_participants" ("attempt_id", "activity_id", "student_user_id", "attempt_number", "joined_at", "added_by_user_id")
SELECT "id", "activity_id", "student_user_id", "number", "started_at", NULL FROM "activity_attempts";

-- Every new attempt gets its owner's row in the same statement, whatever path inserts it (U3).
CREATE FUNCTION "activity_attempts_owner_participant"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "attempt_participants" ("attempt_id", "activity_id", "student_user_id", "attempt_number", "joined_at", "added_by_user_id")
  VALUES (NEW."id", NEW."activity_id", NEW."student_user_id", NEW."number", NEW."started_at", NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_attempts_owner_participant"
  AFTER INSERT ON "activity_attempts"
  FOR EACH ROW EXECUTE FUNCTION "activity_attempts_owner_participant"();

-- The owner's row is the attempt's own; a member's row needs the group, a free slot, the attempt in
-- progress and the member marked present (FR-005, FR-006).
CREATE FUNCTION "attempt_participants_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attempt_row RECORD;
  max_size SMALLINT;
  taken INTEGER;
BEGIN
  SELECT t."student_user_id", t."number", t."status" INTO attempt_row
    FROM "activity_attempts" t WHERE t."id" = NEW."attempt_id";
  IF NEW."attempt_number" IS DISTINCT FROM attempt_row."number" THEN
    RAISE EXCEPTION 'participant % of attempt % must carry its number', NEW."student_user_id", NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."added_by_user_id" IS NULL THEN
    IF NEW."student_user_id" IS DISTINCT FROM attempt_row."student_user_id" THEN
      RAISE EXCEPTION 'only the owner of attempt % joins it unadded', NEW."attempt_id"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "attempt_groups" WHERE "attempt_id" = NEW."attempt_id") THEN
    RAISE EXCEPTION 'attempt % is not a group: no member joins it', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_row."status" IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no member joins it', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "group_size" INTO max_size FROM "class_activities" WHERE "id" = NEW."activity_id";
  SELECT count(*) INTO taken FROM "attempt_participants" WHERE "attempt_id" = NEW."attempt_id";
  IF max_size IS NULL OR taken >= max_size THEN
    RAISE EXCEPTION 'the group of attempt % is full', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
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

CREATE TRIGGER "attempt_participants_insert"
  BEFORE INSERT ON "attempt_participants"
  FOR EACH ROW EXECUTE FUNCTION "attempt_participants_insert"();

CREATE FUNCTION "attempt_participants_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'participant % of attempt % is never changed or removed', OLD."student_user_id", OLD."attempt_id"
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "attempt_participants_immutable"
  BEFORE UPDATE OR DELETE ON "attempt_participants"
  FOR EACH ROW EXECUTE FUNCTION "attempt_participants_immutable"();

-- ── U3, U7: the state of a group attempt ──────────────────────────────────────────────────────

CREATE TABLE "attempt_groups" (
    "attempt_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "leader_user_id" UUID NOT NULL,
    "editor_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempt_groups_pkey" PRIMARY KEY ("attempt_id")
);

-- Required by Prisma for the one-to-one composite relation; `attempt_id` alone is already unique.
CREATE UNIQUE INDEX "attempt_groups_attempt_id_activity_id_key" ON "attempt_groups"("attempt_id", "activity_id");

ALTER TABLE "attempt_groups" ADD CONSTRAINT "attempt_groups_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_groups" ADD CONSTRAINT "attempt_groups_attempt_id_leader_user_id_fkey"
  FOREIGN KEY ("attempt_id", "leader_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_groups" ADD CONSTRAINT "attempt_groups_attempt_id_editor_user_id_fkey"
  FOREIGN KEY ("attempt_id", "editor_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Created with the attempt of a group work, the owner leading and editing.
CREATE FUNCTION "attempt_groups_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_id UUID;
  attempt_status "activity_attempt_status";
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "class_activities" WHERE "id" = NEW."activity_id" AND "group_size" IS NOT NULL) THEN
    RAISE EXCEPTION 'activity % is not a group work', NEW."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "student_user_id", "status" INTO owner_id, attempt_status FROM "activity_attempts" WHERE "id" = NEW."attempt_id";
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is not in progress: no group', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."leader_user_id" IS DISTINCT FROM owner_id OR NEW."editor_user_id" IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'the group of attempt % starts led and edited by its owner', NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_groups_insert"
  BEFORE INSERT ON "attempt_groups"
  FOR EACH ROW EXECUTE FUNCTION "attempt_groups_insert"();

-- Only the leader, the editor and the version change, and only while the attempt is in progress; never deleted.
CREATE FUNCTION "attempt_groups_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'the group of attempt % cannot be deleted', OLD."attempt_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'only the leader, the editor and the version of group % change', OLD."attempt_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "activity_attempts" WHERE "id" = OLD."attempt_id" AND "status" = 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'attempt % is not in progress: its group is final', OLD."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_groups_transition"
  BEFORE UPDATE OR DELETE ON "attempt_groups"
  FOR EACH ROW EXECUTE FUNCTION "attempt_groups_transition"();

-- ── FR-015, FR-020, FR-023: the editing and leadership history (append-only) ─────────────────

CREATE TABLE "attempt_group_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "kind" "attempt_group_event_kind" NOT NULL,
    "reason" "attempt_group_event_reason",
    "actor_user_id" UUID,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempt_group_events_pkey" PRIMARY KEY ("id"),
    -- The system settlement (U9) gives the reason and has no actor; a student's own move has no reason.
    CONSTRAINT "attempt_group_events_reason_chk" CHECK (
      ("reason" IS NOT NULL) = ("kind" IN ('EDITING_RESET', 'LEADER_CHANGED'))
      AND ("actor_user_id" IS NULL) = ("kind" IN ('EDITING_RESET', 'LEADER_CHANGED'))
      AND ("kind" <> 'LEADER_CHANGED' OR "reason" = 'ACCESS_LOST')
    ),
    CONSTRAINT "attempt_group_events_change_chk" CHECK ("from_user_id" <> "to_user_id")
);

CREATE INDEX "attempt_group_events_attempt_id_occurred_at_idx" ON "attempt_group_events"("attempt_id", "occurred_at");

ALTER TABLE "attempt_group_events" ADD CONSTRAINT "attempt_group_events_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "attempt_groups"("attempt_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_group_events" ADD CONSTRAINT "attempt_group_events_attempt_id_actor_user_id_fkey"
  FOREIGN KEY ("attempt_id", "actor_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_group_events" ADD CONSTRAINT "attempt_group_events_attempt_id_from_user_id_fkey"
  FOREIGN KEY ("attempt_id", "from_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_group_events" ADD CONSTRAINT "attempt_group_events_attempt_id_to_user_id_fkey"
  FOREIGN KEY ("attempt_id", "to_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "group_work_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "attempt_group_events_append_only"
  BEFORE UPDATE OR DELETE ON "attempt_group_events"
  FOR EACH ROW EXECUTE FUNCTION "group_work_append_only"();

-- ── U8: who wrote each answer and who submitted ───────────────────────────────────────────────

-- Backfills below rewrite rows the 012/016/018 triggers would refuse (submitted attempts, open pauses).
ALTER TABLE "activity_answers" DISABLE TRIGGER USER;
ALTER TABLE "activity_submissions" DISABLE TRIGGER USER;

ALTER TABLE "activity_answers" ADD COLUMN "saved_by_user_id" UUID;
UPDATE "activity_answers" w SET "saved_by_user_id" = t."student_user_id"
  FROM "activity_attempts" t WHERE t."id" = w."attempt_id";
ALTER TABLE "activity_answers" ALTER COLUMN "saved_by_user_id" SET NOT NULL;

-- The student who submitted; NULL for the teacher's acceptance and an exam the system or the teacher ended.
ALTER TABLE "activity_submissions" ADD COLUMN "submitted_by_user_id" UUID;
UPDATE "activity_submissions" SET "submitted_by_user_id" = "student_user_id"
  WHERE "accepted_by_id" IS NULL AND ("end_reason" IS NULL OR "end_reason" = 'STUDENT_SUBMITTED');

ALTER TABLE "activity_answers" ENABLE TRIGGER USER;
ALTER TABLE "activity_submissions" ENABLE TRIGGER USER;

ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_submitted_by_chk"
  CHECK (
    ("submitted_by_user_id" IS NULL)
    = ("accepted_by_id" IS NOT NULL OR ("end_reason" IS NOT NULL AND "end_reason" <> 'STUDENT_SUBMITTED'))
  );

ALTER TABLE "activity_answers" ADD CONSTRAINT "activity_answers_attempt_id_activity_id_saved_by_user_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "saved_by_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_attempt_id_activity_id_submitted_by_u_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "submitted_by_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FR-012: in a group attempt only the editor writes an answer.
CREATE FUNCTION "activity_answers_group_editor"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  editor_id UUID;
BEGIN
  SELECT "editor_user_id" INTO editor_id FROM "attempt_groups" WHERE "attempt_id" = NEW."attempt_id";
  IF FOUND AND NEW."saved_by_user_id" IS DISTINCT FROM editor_id THEN
    RAISE EXCEPTION 'student % is not the editor of group attempt %', NEW."saved_by_user_id", NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_answers_group_editor"
  BEFORE INSERT OR UPDATE ON "activity_answers"
  FOR EACH ROW EXECUTE FUNCTION "activity_answers_group_editor"();

-- FR-016: in a group attempt only the leader submits.
CREATE FUNCTION "activity_submissions_group_leader"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  leader_id UUID;
BEGIN
  SELECT "leader_user_id" INTO leader_id FROM "attempt_groups" WHERE "attempt_id" = NEW."attempt_id";
  IF FOUND AND NEW."submitted_by_user_id" IS NOT NULL AND NEW."submitted_by_user_id" IS DISTINCT FROM leader_id THEN
    RAISE EXCEPTION 'student % is not the leader of group attempt %', NEW."submitted_by_user_id", NEW."attempt_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_submissions_group_leader"
  BEFORE INSERT ON "activity_submissions"
  FOR EACH ROW EXECUTE FUNCTION "activity_submissions_group_leader"();

-- 012 + 018 + 023: who submitted is a submitted fact too.
CREATE OR REPLACE FUNCTION "activity_submissions_fixed_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submission % cannot be deleted', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id"
     OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
     OR NEW."late" IS DISTINCT FROM OLD."late"
     OR NEW."blank_count" IS DISTINCT FROM OLD."blank_count"
     OR NEW."accepted_by_id" IS DISTINCT FROM OLD."accepted_by_id"
     OR NEW."end_reason" IS DISTINCT FROM OLD."end_reason"
     OR NEW."cancelled_by_id" IS DISTINCT FROM OLD."cancelled_by_id"
     OR NEW."submitted_by_user_id" IS DISTINCT FROM OLD."submitted_by_user_id" THEN
    RAISE EXCEPTION 'the submitted facts of submission % are immutable', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- ── FR-015: who saved each revision (append-only, written only by the trigger) ───────────────

CREATE TABLE "activity_answer_saves" (
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "student_user_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_answer_saves_pkey" PRIMARY KEY ("attempt_id", "question_id", "revision")
);

ALTER TABLE "activity_answer_saves" ADD CONSTRAINT "activity_answer_saves_attempt_id_student_user_id_fkey"
  FOREIGN KEY ("attempt_id", "student_user_id") REFERENCES "attempt_participants"("attempt_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the current revision of every existing answer, by its owner (older revisions were never kept).
INSERT INTO "activity_answer_saves" ("attempt_id", "question_id", "revision", "student_user_id", "saved_at")
SELECT "attempt_id", "question_id", "revision", "saved_by_user_id", "saved_at" FROM "activity_answers";

CREATE FUNCTION "activity_answers_log_save"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."revision" IS DISTINCT FROM OLD."revision" THEN
    INSERT INTO "activity_answer_saves" ("attempt_id", "question_id", "revision", "student_user_id", "saved_at")
    VALUES (NEW."attempt_id", NEW."question_id", NEW."revision", NEW."saved_by_user_id", NEW."saved_at");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "activity_answers_log_save"
  AFTER INSERT OR UPDATE ON "activity_answers"
  FOR EACH ROW EXECUTE FUNCTION "activity_answers_log_save"();

CREATE TRIGGER "activity_answer_saves_append_only"
  BEFORE UPDATE OR DELETE ON "activity_answer_saves"
  FOR EACH ROW EXECUTE FUNCTION "group_work_append_only"();

-- ── U4: per-student facts point at the participant ────────────────────────────────────────────
-- The 3-column FK moves to the participant; the attempt keeps its own 2-column FK.

ALTER TABLE "attempt_integrity_events" DROP CONSTRAINT "attempt_integrity_events_attempt_id_activity_id_student_us_fkey";
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_attempt_id_activity_id_student_us_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_integrity_events" ADD CONSTRAINT "attempt_integrity_events_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_help_requests" DROP CONSTRAINT "work_help_requests_attempt_id_activity_id_student_user_id_fkey";
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_attempt_id_activity_id_student_user_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_help_requests" ADD CONSTRAINT "work_help_requests_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attempt_pauses" DROP CONSTRAINT "attempt_pauses_attempt_id_activity_id_student_user_id_fkey";
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_attempt_id_activity_id_student_user_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_pauses" ADD CONSTRAINT "attempt_pauses_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "code_runs" DROP CONSTRAINT "code_runs_attempt_id_activity_id_student_user_id_fkey";
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_attempt_id_activity_id_student_user_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "attempt_participants"("attempt_id", "activity_id", "student_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_attempt_id_activity_id_fkey"
  FOREIGN KEY ("attempt_id", "activity_id") REFERENCES "activity_attempts"("id", "activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FR-023: each participant has their own room exit, so one open pause per student of the attempt.
DROP INDEX "attempt_pauses_one_open";
CREATE UNIQUE INDEX "attempt_pauses_one_open" ON "attempt_pauses"("attempt_id", "student_user_id") WHERE "released_at" IS NULL;

-- ── U10: the pause triggers look at the writer ────────────────────────────────────────────────

-- 016 + 018 + 023: the open pause that refuses a write is the writer's own on the attempt (an answer's
-- `saved_by_user_id`, a student's submission's `submitted_by_user_id`, an event's, a help's or a run's
-- `student_user_id`). In an individual attempt the writer is always the owner: nothing changes there.
CREATE OR REPLACE FUNCTION "attempt_paused_writes"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  writer UUID;
BEGIN
  IF TG_TABLE_NAME = 'activity_submissions' THEN
    IF NEW."accepted_by_id" IS NOT NULL OR NEW."end_reason" IS DISTINCT FROM 'STUDENT_SUBMITTED' AND NEW."end_reason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    writer := NEW."submitted_by_user_id";
  ELSIF TG_TABLE_NAME = 'activity_answers' THEN
    writer := NEW."saved_by_user_id";
  ELSE
    writer := NEW."student_user_id";
  END IF;
  IF EXISTS (
    SELECT 1 FROM "attempt_pauses" p JOIN "class_activities" a ON a."id" = p."activity_id"
    WHERE p."attempt_id" = NEW."attempt_id" AND p."student_user_id" = writer AND p."released_at" IS NULL AND a."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'attempt % is paused: % on % refused', NEW."attempt_id", TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 016 + 023 (research U15): a presence stays once the student takes part in an attempt, theirs or a group's.
CREATE OR REPLACE FUNCTION "activity_attendances_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'the attendance of student % in activity % is never updated', OLD."student_user_id", OLD."activity_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "attempt_participants"
    WHERE "activity_id" = OLD."activity_id" AND "student_user_id" = OLD."student_user_id"
  ) THEN
    RAISE EXCEPTION 'student % already started activity %: the attendance stays', OLD."student_user_id", OLD."activity_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
