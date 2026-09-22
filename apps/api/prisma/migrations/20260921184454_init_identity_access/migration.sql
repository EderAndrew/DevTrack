-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "role_assignment_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "grant_source" AS ENUM ('SELF_SIGNUP', 'INVITATION', 'ADMIN_BOOTSTRAP');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "bootstrap_status" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'USER_REVOKED', 'PASSWORD_RESET', 'ACCOUNT_CLAIMED', 'ACCOUNT_SUSPENDED', 'ROLE_DEACTIVATED');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'OPERATOR', 'ANONYMOUS', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "status_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "privileged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "role_assignment_status" NOT NULL,
    "granted_by_id" UUID,
    "granted_via" "grant_source" NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMPTZ(6),
    "status_changed_by_id" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" "token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_bootstraps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "target_user_id" UUID,
    "status" "bootstrap_status" NOT NULL,
    "token_hash" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "link_printed" BOOLEAN NOT NULL DEFAULT false,
    "operator_host" TEXT NOT NULL,
    "operator_user" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "admin_bootstraps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" "session_revoke_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_records" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ip" INET NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_status_idx" ON "user_roles"("role_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_invited_by_id_status_idx" ON "invitations"("invited_by_id", "status");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_token_hash_key" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_user_id_purpose_idx" ON "user_tokens"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "admin_bootstraps_token_hash_key" ON "admin_bootstraps"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_events_type_occurred_at_idx" ON "audit_events"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_idx" ON "audit_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "access_records_occurred_at_idx" ON "access_records"("occurred_at");

-- CreateIndex
CREATE INDEX "access_records_user_id_occurred_at_idx" ON "access_records"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters"("expires_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_status_changed_by_id_fkey" FOREIGN KEY ("status_changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_bootstraps" ADD CONSTRAINT "admin_bootstraps_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Manual additions (rules Prisma cannot express — data-model.md, R3, R23)
-- ---------------------------------------------------------------------------

-- E-mails are stored already normalized (trim + lowercase, FR-001).
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_chk" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_normalized_chk" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "admin_bootstraps" ADD CONSTRAINT "admin_bootstraps_email_normalized_chk" CHECK ("email" = lower(btrim("email")));

-- Permission keys follow recurso.acao / recurso.escopo.acao.
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_key_format_chk" CHECK ("key" ~ '^[a-z_]+(\.[a-z_]+)+$');

-- At most one pending invitation per e-mail and role.
CREATE UNIQUE INDEX "invitations_pending_email_role_key"
  ON "invitations" ("email", "role_id") WHERE "status" = 'PENDING';

-- An accepted invitation always records who accepted it and when.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_chk"
  CHECK ("status" <> 'ACCEPTED' OR ("accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL));

-- At most one live token per user and purpose (FR-015, FR-029b).
CREATE UNIQUE INDEX "user_tokens_live_user_purpose_key"
  ON "user_tokens" ("user_id", "purpose") WHERE "used_at" IS NULL AND "invalidated_at" IS NULL;

-- At most one pending admin bootstrap in the whole system (FR-032).
CREATE UNIQUE INDEX "admin_bootstraps_single_pending_key"
  ON "admin_bootstraps" ((true)) WHERE "status" = 'PENDING';

-- audit_events is append-only (FR-077, R23). UPDATE and TRUNCATE are always refused;
-- DELETE is allowed only for the purge job (SET LOCAL devtrack.audit_purge = 'on')
-- and only for rows older than 5 years.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('devtrack.audit_purge', true) = 'on'
     AND OLD."occurred_at" < now() - interval '5 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_append_only"();
