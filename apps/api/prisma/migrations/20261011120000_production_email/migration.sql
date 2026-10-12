-- 017 — E-mail Real em Produção (specs/017-production-email/data-model.md, research N2, N5, N7).
-- One outbox for the six e-mails (`mail_deliveries`, replacing the 003 `class_invitation_deliveries`)
-- and the provider notices (`mail_notices`, append-only). Neither table holds the address, the
-- subject line, the link, the token or a provider message (FR-009).
--
-- The new `delivery_status` values cannot be used as enum literals before this script commits
-- ("unsafe use of new value"), so the CHECKs compare `status::text`; the trigger bodies are
-- PL/pgSQL, parsed only when they run.

-- CreateEnum
CREATE TYPE "mail_kind" AS ENUM ('VERIFY_EMAIL', 'PASSWORD_RESET', 'INVITATION_TEACHER', 'INVITATION_MANAGER', 'ADMIN_ACTIVATION', 'CLASS_INVITATION');

-- CreateEnum
CREATE TYPE "undelivered_reason" AS ENUM ('BOUNCED', 'COMPLAINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "discard_reason" AS ENUM ('EXPIRED', 'REVOKED', 'ACCEPTED', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "mail_notice_provider" AS ENUM ('RESEND', 'SES');

-- CreateEnum
CREATE TYPE "mail_notice_kind" AS ENUM ('DELIVERED', 'BOUNCED', 'TEMPORARY', 'COMPLAINED', 'REJECTED');

-- AlterEnum
ALTER TYPE "delivery_status" ADD VALUE 'DELIVERED';
ALTER TYPE "delivery_status" ADD VALUE 'UNDELIVERED';
ALTER TYPE "delivery_status" ADD VALUE 'DISCARDED';

-- CreateTable
CREATE TABLE "mail_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "mail_kind" NOT NULL,
    "class_invitation_id" UUID,
    "invitation_id" UUID,
    "user_id" UUID,
    "admin_bootstrap_id" UUID,
    "status" "delivery_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "message_id" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "undelivered_at" TIMESTAMPTZ(6),
    "undelivered_reason" "undelivered_reason",
    "discard_reason" "discard_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "mail_notice_provider" NOT NULL,
    "notice_id" TEXT NOT NULL,
    "kind" "mail_notice_kind" NOT NULL,
    "delivery_id" UUID,
    "attempt" INTEGER,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_deliveries_message_id_key" ON "mail_deliveries"("message_id");

-- CreateIndex
CREATE INDEX "mail_deliveries_status_next_attempt_at_idx" ON "mail_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_class_invitation_id_created_at_idx" ON "mail_deliveries"("class_invitation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mail_deliveries_invitation_id_created_at_idx" ON "mail_deliveries"("invitation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mail_deliveries_user_id_kind_idx" ON "mail_deliveries"("user_id", "kind");

-- CreateIndex
CREATE INDEX "mail_deliveries_admin_bootstrap_id_idx" ON "mail_deliveries"("admin_bootstrap_id");

-- CreateIndex
CREATE INDEX "mail_notices_delivery_id_idx" ON "mail_notices"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_notices_provider_notice_id_key" ON "mail_notices"("provider", "notice_id");

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_class_invitation_id_fkey" FOREIGN KEY ("class_invitation_id") REFERENCES "class_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_admin_bootstrap_id_fkey" FOREIGN KEY ("admin_bootstrap_id") REFERENCES "admin_bootstraps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_notices" ADD CONSTRAINT "mail_notices_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "mail_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Manual additions (rules Prisma cannot express — 017 data-model.md)
-- ---------------------------------------------------------------------------

-- Exactly one subject column is set, and it is the one of `kind`.
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_subject_chk" CHECK (
  num_nonnulls("class_invitation_id", "invitation_id", "user_id", "admin_bootstrap_id") = 1
  AND CASE "kind"
    WHEN 'CLASS_INVITATION' THEN "class_invitation_id" IS NOT NULL
    WHEN 'INVITATION_TEACHER' THEN "invitation_id" IS NOT NULL
    WHEN 'INVITATION_MANAGER' THEN "invitation_id" IS NOT NULL
    WHEN 'VERIFY_EMAIL' THEN "user_id" IS NOT NULL
    WHEN 'PASSWORD_RESET' THEN "user_id" IS NOT NULL
    WHEN 'ADMIN_ACTIVATION' THEN "admin_bootstrap_id" IS NOT NULL
  END
);
-- 7 attempts at most (003 waits, research N3).
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_attempts_chk" CHECK ("attempts" BETWEEN 0 AND 7);
-- Only a pending delivery is due.
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_next_attempt_chk"
  CHECK (("status"::text = 'PENDING') = ("next_attempt_at" IS NOT NULL));
-- A short error code, never a message (FR-009).
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_last_error_code_chk"
  CHECK ("last_error_code" ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$');
-- A sent or delivered e-mail has its send time; a delivered one its delivery time.
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_sent_chk"
  CHECK ("status"::text NOT IN ('SENT', 'DELIVERED') OR "sent_at" IS NOT NULL);
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_delivered_chk"
  CHECK ("status"::text <> 'DELIVERED' OR "delivered_at" IS NOT NULL);
-- "Não entregue": the time and the reason together, exactly in UNDELIVERED.
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_undelivered_chk"
  CHECK (("status"::text = 'UNDELIVERED') = ("undelivered_at" IS NOT NULL)
         AND ("undelivered_at" IS NULL) = ("undelivered_reason" IS NULL));
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_discarded_chk"
  CHECK (("status"::text = 'DISCARDED') = ("discard_reason" IS NOT NULL));

-- research N7: kind and subject are fixed; the state moves only along data-model.md's diagram,
-- and a final delivery (UNDELIVERED, FAILED, DISCARDED, SUPERSEDED) never changes. Whether a
-- PENDING → DELIVERED/UNDELIVERED comes from a notice of the current attempt, and whether a
-- DELIVERED → UNDELIVERED (BOUNCED) bounce is older than the delivery, is checked by the service.
CREATE FUNCTION "mail_deliveries_transition"() RETURNS trigger
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
     OR NEW."admin_bootstrap_id" IS DISTINCT FROM OLD."admin_bootstrap_id" THEN
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

CREATE TRIGGER "mail_deliveries_transition"
  BEFORE UPDATE ON "mail_deliveries"
  FOR EACH ROW EXECUTE FUNCTION "mail_deliveries_transition"();

-- FR-012: the provider's id, bounded.
ALTER TABLE "mail_notices" ADD CONSTRAINT "mail_notices_notice_id_chk"
  CHECK (char_length("notice_id") BETWEEN 1 AND 200);
ALTER TABLE "mail_notices" ADD CONSTRAINT "mail_notices_attempt_chk" CHECK ("attempt" BETWEEN 1 AND 7);

-- mail_notices is append-only. The `mail-records` job (SET LOCAL devtrack.mail_purge = 'on', as
-- the audit purge does) may delete notices, and deleting a delivery then clears `delivery_id`
-- (ON DELETE SET NULL); every other UPDATE or DELETE is refused, which also keeps a delivery
-- with notices from being deleted outside the job.
CREATE FUNCTION "mail_notices_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('devtrack.mail_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."delivery_id" IS NOT NULL AND NEW."delivery_id" IS NULL
       AND (NEW."id", NEW."provider", NEW."notice_id", NEW."kind", NEW."attempt", NEW."occurred_at", NEW."received_at")
           IS NOT DISTINCT FROM
           (OLD."id", OLD."provider", OLD."notice_id", OLD."kind", OLD."attempt", OLD."occurred_at", OLD."received_at") THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'mail_notices is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "mail_notices_append_only"
  BEFORE UPDATE OR DELETE ON "mail_notices"
  FOR EACH ROW EXECUTE FUNCTION "mail_notices_append_only"();
CREATE TRIGGER "mail_notices_no_truncate"
  BEFORE TRUNCATE ON "mail_notices"
  FOR EACH STATEMENT EXECUTE FUNCTION "mail_notices_append_only"();

-- The 003 class invitation deliveries become CLASS_INVITATION deliveries, same id, state,
-- attempts, error and dates (FR-007); then the 003 table goes.
INSERT INTO "mail_deliveries"
  ("id", "kind", "class_invitation_id", "status", "attempts", "next_attempt_at", "last_error_code", "sent_at", "created_at", "updated_at")
SELECT "id", 'CLASS_INVITATION', "invitation_id", "status", "attempts", "next_attempt_at", "last_error_code", "sent_at", "created_at", "updated_at"
FROM "class_invitation_deliveries";

ALTER TABLE "class_invitation_deliveries" DROP CONSTRAINT "class_invitation_deliveries_invitation_id_fkey";
DROP TABLE "class_invitation_deliveries";
