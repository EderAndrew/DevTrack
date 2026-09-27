import { z } from "zod";
import { defineAgent, defineTask } from "../../../src/modules/ai/definitions/types";

/**
 * A new agent as 008/US7 asks for it (008 contracts/gateway-routing.md): its task (routing and
 * generation settings), its versioned instructions, its output schema and its tools. Everything
 * else (provider, credential, retries, fallback, circuit, usage, cost, logs, audit) comes from the
 * gateway: this file imports only the definition helpers. Registered only by the suites that use
 * it (`createAiTestApp({ agents, tasks })`), so the 006 reference lists stay as they are.
 */
export const REFERENCE_ROUTED_TASK = defineTask({
  key: "reference-routed",
  primaryModelConfigKey: "fake-default",
  fallbackModelConfigKey: "fake-alt",
  parameters: { temperature: 0 },
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
});

export const REFERENCE_ROUTED = defineAgent({
  key: "reference-routed",
  name: "Agente de referência (roteado)",
  description: "Test-only agent routed by its own task, with a fallback.",
  version: 1,
  initialStatus: "ACTIVE",
  riskLevel: "L1_READ_ONLY",
  requiredPermission: "ia.execucoes.visualizar",
  taskKey: REFERENCE_ROUTED_TASK.key,
  resourceTypes: ["SUBJECT"],
  input: z.strictObject({ text: z.string().max(10_000).optional() }),
  buildContext: (context) => ({ resourceType: context.resource?.type ?? null }),
  prompt: { key: "reference-routed", version: 1, status: "ACTIVE", systemInstructions: "Resuma o recurso autorizado." },
  output: { version: 1, schema: z.strictObject({ summary: z.string().min(1) }) },
  toolKeys: ["reference.read-subject"],
});
