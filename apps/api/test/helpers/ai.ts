import { randomUUID } from "node:crypto";
import type { AiExecutionStatus, AiProposalStatus } from "@repo/contracts";
import type { Prisma } from "../../src/generated/prisma/client";
import { AI_DEFINITIONS, type AiDefinitions } from "../../src/modules/ai/definitions/types";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import type { FakeModelProvider } from "../fixtures/ai/fake-model-provider";
import { api, createTestApp, resetDb, type TestApp, type TestAppOptions } from "./test-app";

/** Extra definitions a suite registers next to the reference ones. */
export type AiExtraDefinitions = Partial<Pick<AiDefinitions, "agents" | "tools" | "modelConfigs" | "tasks" | "resources">>;

export interface AiTestApp extends TestApp {
  /** The fake provider of this app; reset it between tests (006 FR-015). */
  provider: FakeModelProvider;
}

/**
 * `createTestApp` with the reference AI definitions (006 research A4): the registry syncs the
 * reference agents, tools and fake configs at startup. It creates no permission and changes no
 * role — the reference agents require permissions the migrations already seed.
 */
export async function createAiTestApp(options: TestAppOptions & AiExtraDefinitions = {}): Promise<AiTestApp> {
  const definitions = referenceAiDefinitions();
  // Definitions only some suites register (e.g. REFERENCE_L2_BUILD, the 007 agent), next to the reference ones.
  definitions.agents = [...definitions.agents, ...(options.agents ?? [])];
  definitions.tools = [...definitions.tools, ...(options.tools ?? [])];
  definitions.modelConfigs = [...definitions.modelConfigs, ...(options.modelConfigs ?? [])];
  definitions.tasks = [...definitions.tasks, ...(options.tasks ?? [])];
  definitions.resources = { ...definitions.resources, ...options.resources };
  const t = await createTestApp({
    ...options,
    overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }, ...(options.overrides ?? [])],
  });
  return Object.assign(t, { provider: definitions.provider });
}

/** `resetDb` also empties the registry tables, so AI tests sync them again right after. */
export async function resetAiDb(t: AiTestApp): Promise<void> {
  await resetDb(t.prisma);
  await t.get(AiRegistrySync).sync();
  t.provider.reset();
}

/** Runs worker cycles at `now` until nothing is left to claim; returns how many ran. */
export async function drain(t: TestApp, now?: Date): Promise<number> {
  const worker = t.get(AiExecutionWorker);
  let total = 0;
  for (;;) {
    const claimed = await worker.runOnce(now);
    if (claimed === 0) return total;
    total += claimed;
  }
}

/** `POST /api/ai/executions` as the given session, with a fresh idempotency key by default. */
export function requestExecution(t: TestApp, cookie: string, body: Record<string, unknown>) {
  return api(t, { cookie }).post("/api/ai/executions", { idempotencyKey: randomUUID(), ...body });
}

async function currentVersion(t: TestApp, agentKey: string) {
  const agent = await t.prisma.aiAgent.findUniqueOrThrow({
    where: { key: agentKey },
    include: { currentVersion: { include: { promptVersion: true, task: { include: { primaryModelConfig: true, fallbackModelConfig: true } } } } },
  });
  return agent.currentVersion!;
}

export interface AiExecutionOptions {
  status?: AiExecutionStatus;
  resource?: { type: string; id: string } | null;
  createdAt?: Date;
  deadlineAt?: Date;
  errorCode?: string | null;
  durationMs?: number;
  modelCalls?: number;
  toolCalls?: number;
}

const FINAL: readonly AiExecutionStatus[] = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"];

/** An execution written straight to the database, within the schema's rules. */
export async function createAiExecution(t: TestApp, workspaceId: string, agentKey: string, options: AiExecutionOptions = {}) {
  const version = await currentVersion(t, agentKey);
  const status = options.status ?? "QUEUED";
  const createdAt = options.createdAt ?? new Date();
  const final = FINAL.includes(status);
  const durationMs = options.durationMs ?? 1_000;
  return t.prisma.aiExecution.create({
    data: {
      workspaceId,
      requestedByUserId: workspaceId,
      agentVersionId: version.id,
      agentKey,
      agentVersion: version.version,
      promptVersionId: version.promptVersionId,
      promptVersion: version.promptVersion.version,
      outputSchemaVersionId: version.outputSchemaVersionId,
      modelConfigId: version.task!.primaryModelConfigId,
      fallbackModelConfigId: version.task!.fallbackModelConfigId,
      taskKey: version.task!.key,
      provider: version.task!.primaryModelConfig.provider,
      model: version.task!.primaryModelConfig.model,
      riskLevel: version.riskLevel,
      resourceType: options.resource?.type ?? null,
      resourceId: options.resource?.id ?? null,
      status,
      errorCode: final && status !== "COMPLETED" ? (options.errorCode ?? "AI_PROVIDER_ERROR") : null,
      modelCalls: options.modelCalls ?? 0,
      toolCalls: options.toolCalls ?? 0,
      deadlineAt: options.deadlineAt ?? new Date(createdAt.getTime() + 120_000),
      correlationId: `test-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      requestHash: "test",
      createdAt,
      startedAt: status === "QUEUED" ? null : createdAt,
      finishedAt: final ? new Date(createdAt.getTime() + durationMs) : null,
      durationMs: final ? durationMs : null,
      transitions: { create: { fromStatus: null, toStatus: "QUEUED", occurredAt: createdAt } },
    },
  });
}

export interface AiProposalOptions {
  status?: AiProposalStatus;
  payload?: Prisma.InputJsonObject;
  itemIds?: string[];
  expiresAt?: Date;
}

/** A completed L2 execution with its proposal, written straight to the database. */
export async function createAiProposal(t: TestApp, workspaceId: string, targetId: string | null, options: AiProposalOptions = {}) {
  const execution = await createAiExecution(t, workspaceId, "reference-l2", {
    status: "COMPLETED",
    resource: targetId ? { type: "SUBJECT", id: targetId } : null,
  });
  const itemIds = options.itemIds ?? ["i1", "i2", "i3"];
  const status = options.status ?? "READY_FOR_REVIEW";
  const decided = status !== "READY_FOR_REVIEW";
  return t.prisma.aiProposal.create({
    data: {
      workspaceId,
      executionId: execution.id,
      agentVersionId: execution.agentVersionId,
      agentKey: "reference-l2",
      proposalType: "REFERENCE_ITEMS",
      targetResourceType: "SUBJECT",
      targetResourceId: targetId,
      payload: options.payload ?? { items: itemIds.map((id) => ({ id, label: `Item ${id}` })) },
      itemIds,
      acceptedItemIds: status === "PARTIALLY_APPROVED" ? itemIds.slice(0, 1) : [],
      status,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      decidedAt: decided ? new Date() : null,
      decidedByUserId: decided && status !== "EXPIRED" ? workspaceId : null,
    },
  });
}
