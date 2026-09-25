import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PrismaService } from "../../../platform/database/prisma.service";
import type { AuditService } from "../../audit/audit.service";
import { type AiExecutionContext, type AnyToolDefinition, defineTool } from "../definitions/types";
import { createExecutionContext } from "../execution/ai-execution-context";
import type { AiResourceResolver } from "../execution/ai-resource.resolver";
import type { AiToolRegistry } from "../registry/ai-tool.registry";
import { AiToolExecutor } from "./ai-tool-executor";

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";

function setup(options: { enabled?: boolean; owned?: boolean; run?: AnyToolDefinition["run"]; timeoutMs?: number; permissions?: string[]; allowed?: string[] } = {}) {
  const run = vi.fn(options.run ?? (async (_ctx, input: { subjectId: string }) => ({ id: input.subjectId, name: "Disciplina" })));
  const tool = defineTool({
    key: "t.read",
    name: "Ler",
    description: "Lê",
    riskLevel: "L1_READ_ONLY",
    timeoutMs: options.timeoutMs ?? 1_000,
    initialStatus: "ENABLED",
    requiredPermission: "p.ler",
    resourceType: "SUBJECT",
    inputSchema: z.strictObject({ subjectId: z.uuid() }),
    outputSchema: z.strictObject({ id: z.uuid(), name: z.string() }),
    resourceIdOf: (input) => input.subjectId,
    run,
  });
  const byKey = vi.fn(async (key: string) => (key === tool.key ? { id: "tool-id", key, enabled: options.enabled ?? true, definition: tool as AnyToolDefinition } : null));
  const owns = vi.fn(async () => ((options.owned ?? true) ? ("owned" as const) : ("missing" as const)));
  const recorded: { status: string; errorCode: string | null; toolKey: string }[] = [];
  const audits: { type: string; metadata: unknown }[] = [];
  const tx = {
    aiToolCall: { create: vi.fn(async ({ data }: { data: (typeof recorded)[number] }) => recorded.push(data)) },
    aiExecution: { update: vi.fn(async () => ({})) },
  };
  const prisma = { runInTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  const audit = { record: vi.fn(async (_tx: unknown, event: { type: string; metadata: unknown }) => audits.push(event)) } as unknown as AuditService;
  const executor = new AiToolExecutor(prisma, audit, { byKey } as unknown as AiToolRegistry, { owns } as unknown as AiResourceResolver);
  const context: AiExecutionContext = createExecutionContext({
    executionId: "e1",
    userId: "u1",
    workspaceId: "u1",
    agentKey: "a",
    agentVersionId: "v1",
    riskLevel: "L1_READ_ONLY",
    permissions: options.permissions ?? ["p.ler"],
    allowedToolKeys: options.allowed ?? ["t.read"],
    resource: null,
    correlationId: "c1",
    deadline: new Date(Date.now() + 60_000),
    signal: new AbortController().signal,
  });
  const call = (toolKey: string, args: unknown) => executor.call(context, { toolKey, arguments: args }, 1, { toolTimeoutMs: 10_000 });
  return { call, run, byKey, owns, recorded, audits };
}

describe("006/FR-035 AiToolExecutor confere na ordem e para na primeira recusa", () => {
  it("chamada válida: passa pelas 7 etapas, grava SUCCEEDED e ai_tool.called, sem argumentos nem resultado", async () => {
    const s = setup();
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toEqual({ ok: true, result: { id: SUBJECT_ID, name: "Disciplina" } });
    expect(s.owns).toHaveBeenCalledWith("u1", ["SUBJECT"], { type: "SUBJECT", id: SUBJECT_ID });
    expect(s.recorded).toEqual([expect.objectContaining({ status: "SUCCEEDED", errorCode: null, toolKey: "t.read" })]);
    expect(JSON.stringify(s.recorded)).not.toContain("Disciplina");
    expect(s.audits).toEqual([{ type: "ai_tool.called", actorType: "SYSTEM", targetType: "AI_EXECUTION", targetId: "e1", metadata: { toolKey: "t.read", sequence: 1, durationMs: expect.any(Number) } }]);
  });

  it("1. fora da allowlist (ou inexistente) → DENIED AI_TOOL_NOT_ALLOWED, sem consultar o registro", async () => {
    const s = setup({ allowed: [] });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ ok: false, status: "DENIED", code: "AI_TOOL_NOT_ALLOWED" });
    expect(await s.call("nao.existe", {})).toMatchObject({ ok: false, status: "DENIED", code: "AI_TOOL_NOT_ALLOWED" });
    expect(s.byKey).not.toHaveBeenCalled();
    expect(s.owns).not.toHaveBeenCalled();
    expect(s.run).not.toHaveBeenCalled();
    expect(s.audits.map((a) => a.type)).toEqual(["ai_tool.failed", "ai_tool.failed"]);
  });

  it("2. desabilitada → DENIED AI_TOOL_NOT_ALLOWED", async () => {
    const s = setup({ enabled: false });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ status: "DENIED", code: "AI_TOOL_NOT_ALLOWED" });
    expect(s.owns).not.toHaveBeenCalled();
  });

  it("3. usuário sem a permissão da ferramenta → DENIED AI_CONTEXT_ACCESS_DENIED", async () => {
    const s = setup({ permissions: ["outra"] });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ status: "DENIED", code: "AI_CONTEXT_ACCESS_DENIED" });
    expect(s.owns).not.toHaveBeenCalled();
  });

  it.each([
    ["tipo errado", { subjectId: 42 }],
    ["campo a mais", { subjectId: SUBJECT_ID, sql: "SELECT 1" }],
    ["campo faltando", {}],
  ])("4. argumentos inválidos (%s) → recusados antes de qualquer leitura de dados", async (_label, args) => {
    const s = setup();
    expect(await s.call("t.read", args)).toMatchObject({ status: "DENIED", code: "AI_TOOL_EXECUTION_FAILED", reason: "INVALID_ARGUMENTS" });
    expect(s.owns).not.toHaveBeenCalled();
    expect(s.run).not.toHaveBeenCalled();
  });

  it("5. recurso inexistente ou de outra área → DENIED AI_CONTEXT_ACCESS_DENIED, sem rodar", async () => {
    const s = setup({ owned: false });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ status: "DENIED", code: "AI_CONTEXT_ACCESS_DENIED" });
    expect(s.run).not.toHaveBeenCalled();
  });

  it("6. passou do tempo limite → TIMED_OUT AI_TIMEOUT, mesmo que a ferramenta ignore o sinal", async () => {
    const s = setup({ timeoutMs: 20, run: () => new Promise(() => {}) });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ status: "TIMED_OUT", code: "AI_TIMEOUT" });
    expect(s.recorded[0]).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
  });

  it("7. saída com campo não declarado → FAILED AI_TOOL_EXECUTION_FAILED, e o resultado não volta", async () => {
    const s = setup({ run: async () => ({ id: SUBJECT_ID, name: "x", email: "vazou@example.test" }) });
    const outcome = await s.call("t.read", { subjectId: SUBJECT_ID });
    expect(outcome).toEqual({ ok: false, status: "FAILED", code: "AI_TOOL_EXECUTION_FAILED", reason: "INVALID_OUTPUT" });
    expect(JSON.stringify(s.audits)).not.toContain("vazou");
  });

  it("erro inesperado da ferramenta → FAILED AI_TOOL_EXECUTION_FAILED", async () => {
    const s = setup({ run: async () => { throw new Error("boom"); } });
    expect(await s.call("t.read", { subjectId: SUBJECT_ID })).toMatchObject({ status: "FAILED", code: "AI_TOOL_EXECUTION_FAILED" });
  });
});
