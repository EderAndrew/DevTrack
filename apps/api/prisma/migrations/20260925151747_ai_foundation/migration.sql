-- CreateEnum
CREATE TYPE "ai_agent_status" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ai_risk_level" AS ENUM ('L1_READ_ONLY', 'L2_PROPOSAL', 'L3_ACTION');

-- CreateEnum
CREATE TYPE "ai_execution_mode" AS ENUM ('ASYNC');

-- CreateEnum
CREATE TYPE "ai_prompt_status" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ai_model_config_status" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ai_tool_status" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ai_execution_status" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_TOOL', 'VALIDATING_OUTPUT', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ai_execution_step" AS ENUM ('CONTEXT_RESOLVED', 'MODEL_CALL', 'TOOL_CALL', 'OUTPUT_VALIDATION', 'PROPOSAL_CREATED');

-- CreateEnum
CREATE TYPE "ai_call_status" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ai_proposal_status" AS ENUM ('READY_FOR_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ai_evaluation_case_status" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "ai_model_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_model_config_status" NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "max_output_tokens" INTEGER NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "input_price_per_mtok" DECIMAL(12,6),
    "output_price_per_mtok" DECIMAL(12,6),
    "currency" CHAR(3),
    "definition_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ai_agent_status" NOT NULL,
    "current_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "risk_level" "ai_risk_level" NOT NULL,
    "execution_mode" "ai_execution_mode" NOT NULL DEFAULT 'ASYNC',
    "required_permission" TEXT NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "output_schema_version_id" UUID,
    "model_config_id" UUID NOT NULL,
    "resource_types" TEXT[],
    "proposal_type" TEXT,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "on_tool_denied" TEXT NOT NULL DEFAULT 'fail',
    "definition_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "system_instructions" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "ai_prompt_status" NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_output_schema_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "json_schema" JSONB NOT NULL,
    "schema_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_output_schema_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "risk_level" "ai_risk_level" NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "status" "ai_tool_status" NOT NULL,
    "required_permission" TEXT NOT NULL,
    "resource_type" TEXT,
    "input_json_schema" JSONB NOT NULL,
    "output_fields" TEXT[],
    "definition_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_tools" (
    "agent_version_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,

    CONSTRAINT "ai_agent_tools_pkey" PRIMARY KEY ("agent_version_id","tool_id")
);

-- CreateTable
CREATE TABLE "ai_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "agent_version_id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "agent_version" INTEGER NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "output_schema_version_id" UUID,
    "model_config_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "risk_level" "ai_risk_level" NOT NULL,
    "resource_type" TEXT,
    "resource_id" UUID,
    "input" JSONB NOT NULL DEFAULT '{}',
    "status" "ai_execution_status" NOT NULL DEFAULT 'QUEUED',
    "step" "ai_execution_step",
    "error_code" TEXT,
    "model_calls" INTEGER NOT NULL DEFAULT 0,
    "tool_calls" INTEGER NOT NULL DEFAULT 0,
    "claims" INTEGER NOT NULL DEFAULT 0,
    "claim_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "cancel_requested_at" TIMESTAMPTZ(6),
    "correlation_id" TEXT NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,

    CONSTRAINT "ai_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_execution_transitions" (
    "id" BIGSERIAL NOT NULL,
    "execution_id" UUID NOT NULL,
    "from_status" "ai_execution_status",
    "to_status" "ai_execution_status" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_execution_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_execution_outputs" (
    "execution_id" UUID NOT NULL,
    "output_schema_version_id" UUID NOT NULL,
    "output" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_execution_outputs_pkey" PRIMARY KEY ("execution_id")
);

-- CreateTable
CREATE TABLE "ai_model_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "model_config_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_call_status" NOT NULL,
    "attempts" INTEGER NOT NULL,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "estimated_cost" DECIMAL(14,6),
    "currency" CHAR(3),

    CONSTRAINT "ai_model_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "tool_key" TEXT NOT NULL,
    "tool_id" UUID,
    "status" "ai_call_status" NOT NULL,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "agent_version_id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "proposal_type" TEXT NOT NULL,
    "target_resource_type" TEXT NOT NULL,
    "target_resource_id" UUID,
    "payload" JSONB NOT NULL,
    "item_ids" TEXT[],
    "accepted_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ai_proposal_status" NOT NULL DEFAULT 'READY_FOR_REVIEW',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_evaluation_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "input_ref" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "status" "ai_evaluation_case_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_evaluation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_evaluation_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "agent_version_id" UUID NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "model_config_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "ran_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_evaluation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_configs_key_key" ON "ai_model_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_key_key" ON "ai_agents"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_versions_agent_id_version_key" ON "ai_agent_versions"("agent_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_versions_agent_id_key_version_key" ON "ai_prompt_versions"("agent_id", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_output_schema_versions_agent_id_version_key" ON "ai_output_schema_versions"("agent_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_tools_key_key" ON "ai_tools"("key");

-- CreateIndex
CREATE INDEX "ai_executions_workspace_id_created_at_id_idx" ON "ai_executions"("workspace_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "ai_executions_agent_version_id_created_at_idx" ON "ai_executions"("agent_version_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_executions_created_at_idx" ON "ai_executions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_executions_requested_by_user_id_idempotency_key_key" ON "ai_executions"("requested_by_user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ai_execution_transitions_execution_id_id_idx" ON "ai_execution_transitions"("execution_id", "id");

-- CreateIndex
CREATE INDEX "ai_model_calls_started_at_idx" ON "ai_model_calls"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_calls_execution_id_sequence_key" ON "ai_model_calls"("execution_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ai_tool_calls_execution_id_sequence_key" ON "ai_tool_calls"("execution_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ai_proposals_execution_id_key" ON "ai_proposals"("execution_id");

-- CreateIndex
CREATE INDEX "ai_proposals_workspace_id_status_created_at_id_idx" ON "ai_proposals"("workspace_id", "status", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_evaluation_cases_agent_id_key_version_key" ON "ai_evaluation_cases"("agent_id", "key", "version");

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "ai_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_required_permission_fkey" FOREIGN KEY ("required_permission") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "ai_prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_output_schema_version_id_fkey" FOREIGN KEY ("output_schema_version_id") REFERENCES "ai_output_schema_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_output_schema_versions" ADD CONSTRAINT "ai_output_schema_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tools" ADD CONSTRAINT "ai_tools_required_permission_fkey" FOREIGN KEY ("required_permission") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_tools" ADD CONSTRAINT "ai_agent_tools_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "ai_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_tools" ADD CONSTRAINT "ai_agent_tools_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ai_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "ai_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "ai_prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_output_schema_version_id_fkey" FOREIGN KEY ("output_schema_version_id") REFERENCES "ai_output_schema_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_execution_transitions" ADD CONSTRAINT "ai_execution_transitions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_execution_outputs" ADD CONSTRAINT "ai_execution_outputs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_execution_outputs" ADD CONSTRAINT "ai_execution_outputs_output_schema_version_id_fkey" FOREIGN KEY ("output_schema_version_id") REFERENCES "ai_output_schema_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_calls" ADD CONSTRAINT "ai_model_calls_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_calls" ADD CONSTRAINT "ai_model_calls_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ai_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "ai_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_cases" ADD CONSTRAINT "ai_evaluation_cases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ai_evaluation_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "ai_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "ai_prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Rules Prisma cannot express (specs/006-ai-foundation/data-model.md).
-- ---------------------------------------------------------------------------------------------

-- Lists are never NULL (Prisma maps them to nullable text[]).
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_resource_types_chk" CHECK ("resource_types" IS NOT NULL);
ALTER TABLE "ai_tools" ADD CONSTRAINT "ai_tools_output_fields_chk" CHECK ("output_fields" IS NOT NULL);

-- Model configs: sane timeouts and tokens; price and currency together.
ALTER TABLE "ai_model_configs"
  ADD CONSTRAINT "ai_model_configs_key_chk" CHECK ("key" ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  ADD CONSTRAINT "ai_model_configs_tokens_chk" CHECK ("max_output_tokens" > 0),
  ADD CONSTRAINT "ai_model_configs_timeout_chk" CHECK ("timeout_ms" BETWEEN 1000 AND 600000),
  ADD CONSTRAINT "ai_model_configs_price_chk" CHECK (
    ("input_price_per_mtok" IS NULL) = ("output_price_per_mtok" IS NULL)
    AND ("input_price_per_mtok" IS NULL) = ("currency" IS NULL));

-- Agent versions: no L3 in this feature (FR-006); L2 ⇔ output schema and proposal type.
ALTER TABLE "ai_agent_versions"
  ADD CONSTRAINT "ai_agent_versions_version_chk" CHECK ("version" > 0),
  ADD CONSTRAINT "ai_agent_versions_no_l3_chk" CHECK ("risk_level" <> 'L3_ACTION'),
  ADD CONSTRAINT "ai_agent_versions_l2_chk" CHECK (
    ("risk_level" = 'L2_PROPOSAL') = ("proposal_type" IS NOT NULL)
    AND ("risk_level" <> 'L2_PROPOSAL' OR "output_schema_version_id" IS NOT NULL)),
  ADD CONSTRAINT "ai_agent_versions_on_tool_denied_chk" CHECK ("on_tool_denied" IN ('continue', 'fail'));

ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_version_chk" CHECK ("version" > 0);
ALTER TABLE "ai_output_schema_versions" ADD CONSTRAINT "ai_output_schema_versions_version_chk" CHECK ("version" > 0);

-- Tools: read-only in this feature; bounded timeout.
ALTER TABLE "ai_tools"
  ADD CONSTRAINT "ai_tools_l1_chk" CHECK ("risk_level" = 'L1_READ_ONLY'),
  ADD CONSTRAINT "ai_tools_timeout_chk" CHECK ("timeout_ms" BETWEEN 100 AND 60000);

-- Executions: impossible states are unrepresentable (research A8).
ALTER TABLE "ai_executions"
  ADD CONSTRAINT "ai_executions_workspace_chk" CHECK ("workspace_id" = "requested_by_user_id"),
  ADD CONSTRAINT "ai_executions_no_l3_chk" CHECK ("risk_level" <> 'L3_ACTION'),
  ADD CONSTRAINT "ai_executions_resource_chk" CHECK (("resource_type" IS NULL) = ("resource_id" IS NULL)),
  ADD CONSTRAINT "ai_executions_error_code_chk" CHECK ("error_code" ~ '^AI_[A-Z_]+$'),
  ADD CONSTRAINT "ai_executions_final_chk" CHECK (
    ("status" IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'))
      = ("finished_at" IS NOT NULL AND "duration_ms" IS NOT NULL)),
  ADD CONSTRAINT "ai_executions_error_chk" CHECK (
    ("status" IN ('FAILED', 'CANCELLED', 'TIMED_OUT')) = ("error_code" IS NOT NULL)),
  ADD CONSTRAINT "ai_executions_counters_chk" CHECK ("model_calls" >= 0 AND "tool_calls" >= 0 AND "claims" >= 0);

-- Model and tool calls.
ALTER TABLE "ai_model_calls"
  ADD CONSTRAINT "ai_model_calls_sequence_chk" CHECK ("sequence" > 0),
  ADD CONSTRAINT "ai_model_calls_status_chk" CHECK ("status" <> 'DENIED'),
  ADD CONSTRAINT "ai_model_calls_attempts_chk" CHECK ("attempts" >= 1),
  ADD CONSTRAINT "ai_model_calls_error_chk" CHECK (
    ("status" = 'SUCCEEDED') = ("error_code" IS NULL) AND "error_code" ~ '^AI_[A-Z_]+$'),
  ADD CONSTRAINT "ai_model_calls_cost_chk" CHECK (("estimated_cost" IS NULL) = ("currency" IS NULL));
ALTER TABLE "ai_tool_calls"
  ADD CONSTRAINT "ai_tool_calls_sequence_chk" CHECK ("sequence" > 0),
  ADD CONSTRAINT "ai_tool_calls_error_chk" CHECK (
    ("status" = 'SUCCEEDED') = ("error_code" IS NULL) AND "error_code" ~ '^AI_[A-Z_]+$');

-- Proposals: decision fields follow the status (research A13).
ALTER TABLE "ai_proposals"
  ADD CONSTRAINT "ai_proposals_item_ids_chk" CHECK ("item_ids" IS NOT NULL AND "accepted_item_ids" IS NOT NULL),
  ADD CONSTRAINT "ai_proposals_partial_chk" CHECK (
    ("status" = 'PARTIALLY_APPROVED') = (cardinality("accepted_item_ids") > 0)),
  ADD CONSTRAINT "ai_proposals_decided_at_chk" CHECK (("status" <> 'READY_FOR_REVIEW') = ("decided_at" IS NOT NULL)),
  ADD CONSTRAINT "ai_proposals_decided_by_chk" CHECK (
    ("status" IN ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED')) = ("decided_by_user_id" IS NOT NULL));

ALTER TABLE "ai_evaluation_cases" ADD CONSTRAINT "ai_evaluation_cases_version_chk" CHECK ("version" > 0);

-- Partial indexes: the worker's queue, the deadline sweep, proposal expiry and retention.
CREATE INDEX "ai_executions_queue_idx" ON "ai_executions" ("created_at", "id") WHERE "status" = 'QUEUED';
CREATE INDEX "ai_executions_deadline_idx" ON "ai_executions" ("deadline_at")
  WHERE "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');
CREATE INDEX "ai_executions_retention_idx" ON "ai_executions" ("finished_at") WHERE "finished_at" IS NOT NULL;
CREATE INDEX "ai_proposals_expiry_idx" ON "ai_proposals" ("expires_at") WHERE "status" = 'READY_FOR_REVIEW';

-- Immutability (FR-010, FR-047). Tests truncate with session_replication_role = replica, which
-- skips these row triggers.

-- A version used by an execution never changes content; only `used_at` itself may be set.
CREATE FUNCTION "ai_version_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."used_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'used_at' - 'updated_at' - 'status') IS DISTINCT FROM
         (to_jsonb(OLD) - 'used_at' - 'updated_at' - 'status') THEN
    RAISE EXCEPTION 'used AI version is immutable (% refused on %)', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ai_prompt_versions_immutable"
  BEFORE UPDATE ON "ai_prompt_versions"
  FOR EACH ROW EXECUTE FUNCTION "ai_version_immutable"();
CREATE TRIGGER "ai_output_schema_versions_immutable"
  BEFORE UPDATE ON "ai_output_schema_versions"
  FOR EACH ROW EXECUTE FUNCTION "ai_version_immutable"();
CREATE TRIGGER "ai_agent_versions_immutable"
  BEFORE UPDATE ON "ai_agent_versions"
  FOR EACH ROW EXECUTE FUNCTION "ai_version_immutable"();

-- The generated content of a proposal is kept as produced (FR-047).
CREATE FUNCTION "ai_proposal_payload_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."item_ids" IS DISTINCT FROM OLD."item_ids" THEN
    RAISE EXCEPTION 'AI proposal content is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ai_proposal_payload_immutable"
  BEFORE UPDATE ON "ai_proposals"
  FOR EACH ROW EXECUTE FUNCTION "ai_proposal_payload_immutable"();

-- The transition trail is append-only; rows leave only with their execution (retention).
CREATE FUNCTION "ai_execution_transitions_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_execution_transitions is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "ai_execution_transitions_append_only"
  BEFORE UPDATE ON "ai_execution_transitions"
  FOR EACH ROW EXECUTE FUNCTION "ai_execution_transitions_append_only"();

-- Reference data: permissions of specs/006-ai-foundation/contracts/permissions.md. Idempotent.
INSERT INTO "permissions" ("key", "description") VALUES
  ('ia.execucoes.visualizar', 'Pedir (com a permissão do agente), listar, ver e cancelar as próprias execuções de IA'),
  ('ia.propostas.revisar',    'Listar, abrir e decidir as próprias propostas de IA'),
  ('ia.operacao.visualizar',  'Ver saúde, indicadores, uso, custo, agentes e configurações de modelo da IA, sem conteúdo'),
  ('ia.agentes.gerenciar',    'Habilitar e desabilitar agentes e configurações de modelo de IA')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('TEACHER', 'ia.execucoes.visualizar'),
  ('TEACHER', 'ia.propostas.revisar'),
  ('ADMIN',   'ia.operacao.visualizar'),
  ('ADMIN',   'ia.agentes.gerenciar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
