import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../platform/database/prisma.service";
import { stableHash } from "../registry/ai-definitions.check";

const CaseInputSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,62}$/),
  version: z.int().min(1),
  /** A fixture path or an id, never content copied from a teacher. */
  inputRef: z.string().trim().min(1).max(500),
  expected: z.record(z.string(), z.json()),
  status: z.enum(["ACTIVE", "RETIRED"]).default("ACTIVE"),
});

const ResultInputSchema = z.strictObject({
  agentVersionId: z.uuid(),
  promptVersionId: z.uuid(),
  modelConfigId: z.uuid(),
  passed: z.boolean(),
  /** Numbers only (data-model): no output, no content. */
  metrics: z.record(z.string().max(63), z.number().finite()).default({}),
});

export type AiEvaluationCaseInput = z.input<typeof CaseInputSchema>;
export type AiEvaluationResultInput = z.input<typeof ResultInputSchema>;

/** A call the store refuses: a programming error of the agent's evaluation code. */
export class AiEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiEvaluationError";
  }
}

/**
 * Evaluation cases and results of the agents (006 FR-064, constitution XIX), for the agents'
 * specs; the foundation has no runner and no routes. Both tables are insert-only. A result is
 * tied to the agent version, the prompt version and the model config it ran with, so versions
 * can be compared.
 */
@Injectable()
export class AiEvaluationStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent by `(agent, key, version)`: recording the same case again returns it. The same
   * key and version with other content is refused — publish a new version instead.
   */
  async recordCase(agentKey: string, input: AiEvaluationCaseInput): Promise<{ id: string; created: boolean }> {
    const data = CaseInputSchema.parse(input);
    const agent = await this.prisma.aiAgent.findUnique({ where: { key: agentKey }, select: { id: true } });
    if (!agent) throw new AiEvaluationError(`unknown agent "${agentKey}"`);

    const where = { agentId_key_version: { agentId: agent.id, key: data.key, version: data.version } };
    const { count } = await this.prisma.aiEvaluationCase.createMany({
      data: [{ agentId: agent.id, key: data.key, version: data.version, inputRef: data.inputRef, expected: data.expected as Prisma.InputJsonObject, status: data.status }],
      skipDuplicates: true,
    });
    const row = await this.prisma.aiEvaluationCase.findUniqueOrThrow({ where });
    const same =
      row.inputRef === data.inputRef && row.status === data.status && stableHash(row.expected) === stableHash(data.expected);
    if (!same) throw new AiEvaluationError(`evaluation case "${data.key}" v${data.version} of agent "${agentKey}" already exists with other content; publish a new version`);
    return { id: row.id, created: count === 1 };
  }

  /**
   * The prompt version must be the agent version's own. Provider and model are copied from the
   * config, as an execution does.
   */
  async recordResult(caseId: string, input: AiEvaluationResultInput): Promise<{ id: string }> {
    const data = ResultInputSchema.parse(input);
    const evaluationCase = await this.prisma.aiEvaluationCase.findUnique({ where: { id: caseId }, select: { agentId: true } });
    if (!evaluationCase) throw new AiEvaluationError("unknown evaluation case");
    const [agentVersion, config] = await Promise.all([
      this.prisma.aiAgentVersion.findUnique({ where: { id: data.agentVersionId }, select: { agentId: true, promptVersionId: true } }),
      this.prisma.aiModelConfig.findUnique({ where: { id: data.modelConfigId }, select: { provider: true, model: true } }),
    ]);
    if (agentVersion?.agentId !== evaluationCase.agentId) throw new AiEvaluationError("the agent version is not of the case's agent");
    if (agentVersion.promptVersionId !== data.promptVersionId) throw new AiEvaluationError("the prompt version is not the agent version's");
    if (!config) throw new AiEvaluationError("unknown model config");

    return this.prisma.aiEvaluationResult.create({
      data: {
        caseId,
        agentVersionId: data.agentVersionId,
        promptVersionId: data.promptVersionId,
        modelConfigId: data.modelConfigId,
        provider: config.provider,
        model: config.model,
        passed: data.passed,
        metrics: data.metrics,
      },
      select: { id: true },
    });
  }
}
