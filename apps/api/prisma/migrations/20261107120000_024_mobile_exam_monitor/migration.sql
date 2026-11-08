-- 024 — Monitoramento de provas no celular (specs/024-mobile-exam-monitor/data-model.md, research Y3, Y5,
-- Y6, Y8, Y9). The session gets its kind (WEB/MOBILE, fixed at creation); a MOBILE session may hold one
-- device for push; a teacher may mute an exam; each counted occurrence or hold writes one alert into an
-- outbox, sent at most once per device. Nothing of the 018 exam tables changes. Only the `exam-alerts`
-- retention job deletes alerts (SET LOCAL devtrack.exam_alert_purge = 'on'), their deliveries in cascade.

-- CreateEnum
CREATE TYPE "session_client" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "mobile_platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "exam_alert_kind" AS ENUM ('OCCURRENCE', 'HOLD');

-- CreateEnum
CREATE TYPE "exam_alert_status" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "exam_alert_delivery_status" AS ENUM ('SENDING', 'TICKET_OK', 'TICKET_ERROR', 'RECEIPT_OK', 'RECEIPT_ERROR');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "client" "session_client" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "mobile_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "mobile_platform" NOT NULL,
    "push_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_alert_mutes" (
    "teacher_user_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_alert_mutes_pkey" PRIMARY KEY ("teacher_user_id","activity_id")
);

-- CreateTable
CREATE TABLE "exam_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "exam_alert_kind" NOT NULL,
    "activity_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "occurrence_ordinal" SMALLINT NOT NULL,
    "hold_id" UUID,
    "status" "exam_alert_status" NOT NULL DEFAULT 'PENDING',
    "tries" SMALLINT NOT NULL DEFAULT 0,
    "claimed_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_alert_deliveries" (
    "alert_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "status" "exam_alert_delivery_status" NOT NULL,
    "ticket_id" TEXT,
    "error_code" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    "receipt_checked_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_alert_deliveries_pkey" PRIMARY KEY ("alert_id","device_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_devices_session_id_key" ON "mobile_devices"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_devices_push_token_key" ON "mobile_devices"("push_token");

-- CreateIndex
CREATE INDEX "mobile_devices_user_id_idx" ON "mobile_devices"("user_id");

-- CreateIndex
CREATE INDEX "exam_alert_mutes_activity_id_idx" ON "exam_alert_mutes"("activity_id");

-- CreateIndex
CREATE INDEX "exam_alerts_status_created_at_idx" ON "exam_alerts"("status", "created_at");

-- CreateIndex
CREATE INDEX "exam_alerts_activity_id_idx" ON "exam_alerts"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_alerts_attempt_id_occurrence_ordinal_key" ON "exam_alerts"("attempt_id", "occurrence_ordinal");

-- CreateIndex
CREATE INDEX "exam_alert_deliveries_status_sent_at_idx" ON "exam_alert_deliveries"("status", "sent_at");

-- AddForeignKey
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alert_mutes" ADD CONSTRAINT "exam_alert_mutes_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alert_mutes" ADD CONSTRAINT "exam_alert_mutes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_attempt_fkey" FOREIGN KEY ("attempt_id", "activity_id", "student_user_id") REFERENCES "activity_attempts"("id", "activity_id", "student_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "exam_attempt_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_alert_deliveries" ADD CONSTRAINT "exam_alert_deliveries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "exam_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── CHECKs ──────────────────────────────────────────────────────────────────────────────────

ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_push_token_chk"
  CHECK ("push_token" ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$');

ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_ordinal_chk" CHECK ("occurrence_ordinal" >= 1);
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_tries_chk" CHECK ("tries" BETWEEN 0 AND 3);
ALTER TABLE "exam_alerts" ADD CONSTRAINT "exam_alerts_hold_chk"
  CHECK (("kind" = 'HOLD') = ("hold_id" IS NOT NULL));

ALTER TABLE "exam_alert_deliveries" ADD CONSTRAINT "exam_alert_deliveries_error_code_chk"
  CHECK ("error_code" IS NULL OR "error_code" ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$');

-- ── sessions.client is fixed at creation (research Y3) ──────────────────────────────────────

CREATE FUNCTION "sessions_client_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."client" IS DISTINCT FROM OLD."client" THEN
    RAISE EXCEPTION 'sessions.client is fixed at creation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "sessions_client_immutable"
  BEFORE UPDATE OF "client" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "sessions_client_immutable"();

-- ── mobile_devices: a MOBILE session of the same user (research Y9) ─────────────────────────

CREATE FUNCTION "mobile_devices_session_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  session_row RECORD;
BEGIN
  SELECT "user_id", "client" INTO session_row FROM "sessions" WHERE "id" = NEW."session_id";
  IF NOT FOUND THEN
    RETURN NEW; -- the FK reports it
  END IF;
  IF session_row."client" <> 'MOBILE' THEN
    RAISE EXCEPTION 'a device needs a MOBILE session' USING ERRCODE = 'check_violation';
  END IF;
  IF session_row."user_id" <> NEW."user_id" THEN
    RAISE EXCEPTION 'a device belongs to the user of its session' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "mobile_devices_session_check"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "mobile_devices"
  FOR EACH ROW EXECUTE FUNCTION "mobile_devices_session_check"();

-- ── exam_alert_mutes: only an EXAM activity (research Y8) ───────────────────────────────────

CREATE FUNCTION "exam_alert_mutes_exam_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "class_activities" WHERE "id" = NEW."activity_id" AND "type" = 'EXAM') THEN
    RAISE EXCEPTION 'an exam alert mute needs only an EXAM activity' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_alert_mutes_exam_check"
  BEFORE INSERT OR UPDATE OF "activity_id" ON "exam_alert_mutes"
  FOR EACH ROW EXECUTE FUNCTION "exam_alert_mutes_exam_check"();

-- ── exam_alerts: a settled alert stays as it is; only the retention job deletes (research Y5, Y12) ──

CREATE FUNCTION "exam_alerts_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('devtrack.exam_alert_purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'DELETE of exam_alerts refused (only the exam-alerts retention job deletes)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'a settled exam alert (%) does not change', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."activity_id" IS DISTINCT FROM OLD."activity_id"
     OR NEW."attempt_id" IS DISTINCT FROM OLD."attempt_id" OR NEW."student_user_id" IS DISTINCT FROM OLD."student_user_id"
     OR NEW."occurrence_ordinal" IS DISTINCT FROM OLD."occurrence_ordinal" OR NEW."hold_id" IS DISTINCT FROM OLD."hold_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'the facts of an exam alert do not change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exam_alerts_guard"
  BEFORE UPDATE OR DELETE ON "exam_alerts"
  FOR EACH ROW EXECUTE FUNCTION "exam_alerts_guard"();
