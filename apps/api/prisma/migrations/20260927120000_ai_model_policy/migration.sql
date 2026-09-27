-- 009 (AI model policy): the model catalog on ai_model_configs (research H2–H4), the task policy
-- in place of the task's fixed route (H5), approvals per model × task (H6), the admin's override
-- per task (H11), budget alerts (H16), and the tier, selection and escalation of executions and
-- calls (H7, H9, H14). The 008 route columns of ai_tasks and their CHECK go away.

-- CreateEnum
CREATE TYPE "ai_model_tier" AS ENUM ('BASIC', 'STANDARD', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ai_model_mode" AS ENUM ('GENERATION', 'DECISION');

-- CreateEnum
CREATE TYPE "ai_model_lifecycle" AS ENUM ('CANDIDATE', 'EVALUATING', 'PRODUCTION', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ai_selection_reason" AS ENUM ('OVERRIDE', 'LOWEST_COST', 'ONLY_CANDIDATE', 'DEPRECATED_ONLY');

-- DropForeignKey
ALTER TABLE "ai_tasks" DROP CONSTRAINT "ai_tasks_fallback_model_config_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_tasks" DROP CONSTRAINT "ai_tasks_primary_model_config_id_fkey";

-- AlterTable
ALTER TABLE "ai_executions" ADD COLUMN     "escalation_from_tier" "ai_model_tier",
ADD COLUMN     "escalation_model_config_id" UUID,
ADD COLUMN     "escalation_reason" TEXT,
ADD COLUMN     "escalation_to_tier" "ai_model_tier",
ADD COLUMN     "escalation_used" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selection_reason" "ai_selection_reason",
ADD COLUMN     "tier" "ai_model_tier";

-- AlterTable
ALTER TABLE "ai_model_calls" ADD COLUMN     "family" TEXT,
ADD COLUMN     "is_escalation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tier" "ai_model_tier";

-- AlterTable
ALTER TABLE "ai_model_configs" ADD COLUMN     "capabilities" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "context_window" INTEGER,
ADD COLUMN     "family" TEXT,
ADD COLUMN     "lifecycle" "ai_model_lifecycle" NOT NULL DEFAULT 'CANDIDATE',
ADD COLUMN     "mode" "ai_model_mode" NOT NULL DEFAULT 'GENERATION',
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tier" "ai_model_tier";

-- AlterTable
ALTER TABLE "ai_tasks" DROP COLUMN "fallback_model_config_id",
DROP COLUMN "primary_model_config_id",
ADD COLUMN     "policy" JSONB NOT NULL DEFAULT '{"preferredTier":"BASIC"}',
ADD COLUMN     "preferred_tier" "ai_model_tier" NOT NULL DEFAULT 'BASIC';

-- Existing tasks get a placeholder until the next registry sync writes their policy (their
-- definition hash no longer matches, so the sync rewrites every row); no default afterwards.
ALTER TABLE "ai_tasks" ALTER COLUMN "policy" DROP DEFAULT,
ALTER COLUMN "preferred_tier" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ai_model_task_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_config_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "metrics" JSONB NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
    "evidence" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_model_task_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_overrides" (
    "task_id" UUID NOT NULL,
    "model_config_id" UUID NOT NULL,
    "set_by_user_id" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_task_overrides_pkey" PRIMARY KEY ("task_id")
);

-- CreateTable
CREATE TABLE "ai_budget_alerts" (
    "scope" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "subject_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_budget_alerts_pkey" PRIMARY KEY ("scope","period_start","subject_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_task_approvals_model_config_id_task_id_key" ON "ai_model_task_approvals"("model_config_id", "task_id");

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_escalation_model_config_id_fkey" FOREIGN KEY ("escalation_model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_task_approvals" ADD CONSTRAINT "ai_model_task_approvals_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_task_approvals" ADD CONSTRAINT "ai_model_task_approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_overrides" ADD CONSTRAINT "ai_task_overrides_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_overrides" ADD CONSTRAINT "ai_task_overrides_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_overrides" ADD CONSTRAINT "ai_task_overrides_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catalog rows: family and tier together; the family is the id's vendor prefix when it has one
-- (research H3); a decision model generates nothing (no structured output, no tools).
ALTER TABLE "ai_model_configs"
  ADD CONSTRAINT "ai_model_configs_catalog_chk" CHECK (("family" IS NULL) = ("tier" IS NULL)),
  ADD CONSTRAINT "ai_model_configs_family_chk" CHECK (
    "family" IS NULL OR position('/' in "model") = 0 OR split_part("model", '/', 1) = "family"),
  ADD CONSTRAINT "ai_model_configs_context_window_chk" CHECK ("context_window" IS NULL OR "context_window" > 0),
  ADD CONSTRAINT "ai_model_configs_decision_chk" CHECK (
    "mode" <> 'DECISION'
    OR (coalesce(("capabilities"->>'structuredOutput')::boolean, false) = false
        AND coalesce(("capabilities"->>'tools')::boolean, false) = false));

-- One catalog entry per model (one tier per model, spec edge case); legacy rows stay for history.
CREATE UNIQUE INDEX "ai_model_configs_catalog_model_key" ON "ai_model_configs"("model") WHERE "tier" IS NOT NULL;

-- Tasks: the queryable tier is the policy's.
ALTER TABLE "ai_tasks"
  ADD CONSTRAINT "ai_tasks_policy_tier_chk" CHECK ("policy"->>'preferredTier' = "preferred_tier"::text);

-- Approvals point at an evidence file.
ALTER TABLE "ai_model_task_approvals"
  ADD CONSTRAINT "ai_model_task_approvals_evidence_chk" CHECK (length("evidence") > 0);

-- Executions: tier and reason together; escalation all or nothing, always upwards.
ALTER TABLE "ai_executions"
  ADD CONSTRAINT "ai_executions_selection_chk" CHECK (("tier" IS NULL) = ("selection_reason" IS NULL)),
  ADD CONSTRAINT "ai_executions_escalation_chk" CHECK (
    "escalation_used" = ("escalation_from_tier" IS NOT NULL)
    AND "escalation_used" = ("escalation_to_tier" IS NOT NULL)
    AND "escalation_used" = ("escalation_reason" IS NOT NULL)
    AND "escalation_used" = ("escalation_model_config_id" IS NOT NULL)),
  ADD CONSTRAINT "ai_executions_escalation_up_chk" CHECK (NOT "escalation_used" OR "escalation_to_tier" > "escalation_from_tier"),
  ADD CONSTRAINT "ai_executions_escalation_reason_chk" CHECK ("escalation_reason" IS NULL OR "escalation_reason" = 'OUTPUT_INVALID');

-- Budget alerts: known scopes only; never a user id in clear (subject_hash).
ALTER TABLE "ai_budget_alerts"
  ADD CONSTRAINT "ai_budget_alerts_scope_chk" CHECK ("scope" ~ '^(DAILY|MONTHLY|PER_USER|PER_AGENT:[a-z0-9][a-z0-9.-]{1,62})$');
