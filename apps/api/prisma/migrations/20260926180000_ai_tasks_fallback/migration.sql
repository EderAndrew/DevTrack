-- 008 (AI gateway with OpenRouter): tasks with a primary and a fallback model config (research
-- G2), the route fixed on each execution (G5), and the served model, fallback and cost source of
-- each call to the model (G6, G12, G17).

-- CreateTable
CREATE TABLE "ai_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "primary_model_config_id" UUID NOT NULL,
    "fallback_model_config_id" UUID,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "max_output_tokens" INTEGER NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "definition_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_tasks_key_key" ON "ai_tasks"("key");

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_primary_model_config_id_fkey" FOREIGN KEY ("primary_model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_fallback_model_config_id_fkey" FOREIGN KEY ("fallback_model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tasks: same key rule, tokens and timeout bounds as model configs; a fallback is another config.
ALTER TABLE "ai_tasks"
  ADD CONSTRAINT "ai_tasks_key_chk" CHECK ("key" ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  ADD CONSTRAINT "ai_tasks_tokens_chk" CHECK ("max_output_tokens" > 0),
  ADD CONSTRAINT "ai_tasks_timeout_chk" CHECK ("timeout_ms" BETWEEN 1000 AND 600000),
  ADD CONSTRAINT "ai_tasks_fallback_chk" CHECK ("fallback_model_config_id" <> "primary_model_config_id");

-- Agent versions: the ones synced before 008 keep their model config; new ones point at a task.
-- The 006 immutability trigger compares the whole row, so it also freezes `task_id` once used.
ALTER TABLE "ai_agent_versions" ADD COLUMN "task_id" UUID,
ALTER COLUMN "model_config_id" DROP NOT NULL;

ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_route_chk"
  CHECK (("task_id" IS NULL) <> ("model_config_id" IS NULL));

-- Executions: the route fixed at request (`model_config_id` is its primary).
ALTER TABLE "ai_executions" ADD COLUMN "fallback_model_config_id" UUID,
ADD COLUMN "fallback_used" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "task_key" TEXT;

ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_fallback_model_config_id_fkey" FOREIGN KEY ("fallback_model_config_id") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_executions"
  ADD CONSTRAINT "ai_executions_fallback_chk" CHECK ("fallback_model_config_id" <> "model_config_id"),
  ADD CONSTRAINT "ai_executions_fallback_used_chk" CHECK (NOT "fallback_used" OR "fallback_model_config_id" IS NOT NULL);

-- Model calls: the served model, the fallback leg and where the cost came from.
ALTER TABLE "ai_model_calls" ADD COLUMN "cost_source" TEXT,
ADD COLUMN "is_fallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "served_model" TEXT;

ALTER TABLE "ai_model_calls"
  ADD CONSTRAINT "ai_model_calls_cost_source_chk" CHECK ("cost_source" IN ('PROVIDER', 'PRICE')),
  ADD CONSTRAINT "ai_model_calls_cost_source_null_chk" CHECK (("cost_source" IS NULL) = ("estimated_cost" IS NULL));
