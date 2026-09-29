import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../../src/modules/ai/definitions/model-catalog";
import { API_ROOT } from "../helpers/env";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp, requestBatch } from "../helpers/exercise-ai";
import { createConfirmedTopic } from "../helpers/exercises";
import { createUser, loginAs } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

/**
 * 010/FR-007, 010/FR-025, 010/SC-009: the exercise modules never choose a model. The pedagogical
 * difficulty (BASIC, INTERMEDIATE, ADVANCED) shares words with the model tiers, so the scan looks
 * for the policy's own identifiers instead; the only place a tier or a family may be named is the
 * task declaration (`defineTask`), where the 009 policy reads them.
 */

const MODULES = ["src/modules/exercise-ai", "src/modules/exercises"];
const DEFINITIONS_FILE = "src/modules/exercise-ai/definitions/exercise-generator.ts";

const FORBIDDEN = [
  /\bModelTier\b/,
  /\bAiModelTier\b/,
  /\brouteFor\b/,
  /\bselectRoute\b/,
  /\bMODEL_CATALOG\b/,
  /model-catalog/,
  /\bPolicyRoute\b/,
  /\bmodelConfig/i,
  /openrouter/i,
  /["'](?:openai|anthropic|typesafe)["']/,
  /\btier\b/i,
  new RegExp(`["'](?:${MODEL_CATALOG.map((entry) => entry.key).join("|")})["']`),
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".spec.ts") ? [path] : [];
  });
}

/** The declaration file without its `defineTask({…})` block and the imports that feed it. */
function withoutTaskDeclaration(text: string): string {
  const start = text.indexOf("export const EXERCISE_GENERATION_TASK = defineTask({");
  const end = text.indexOf("\n});", start);
  expect(start, "declaração da tarefa").toBeGreaterThan(-1);
  return (text.slice(0, start) + text.slice(end + 4)).replace(/^import .*model-families.*$/m, "");
}

describe("010/FR-007 010/SC-009 as regras de exercício não escolhem modelo", () => {
  it("nenhum arquivo de exercises nem de exercise-ai cita nível, família, catálogo, rota ou provedor (fora da declaração da tarefa)", () => {
    const offenders = MODULES.flatMap((dir) => sources(join(API_ROOT, dir))).flatMap((path) => {
      const name = relative(API_ROOT, path);
      const raw = readFileSync(path, "utf8");
      const text = name === DEFINITIONS_FILE ? withoutTaskDeclaration(raw) : raw;
      // Code only: a comment may explain that nothing here picks a tier.
      const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);
      return text
        .split("\n")
        .flatMap((line, index) => (!isComment(line) && FORBIDDEN.some((pattern) => pattern.test(line)) ? [`${name}:${index + 1}: ${line.trim()}`] : []));
    });
    expect(offenders).toEqual([]);
  });

  it("controle: a varredura acha um nível citado fora da declaração", () => {
    expect(FORBIDDEN.some((pattern) => pattern.test('const tier: ModelTier = "STANDARD";'))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test('difficulty: "ADVANCED"'))).toBe(false);
  });

  describe("010/US2-6 a dificuldade nunca muda o modelo", () => {
    let t: AiTestApp;

    beforeAll(async () => {
      t = await createExerciseAiApp({ config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, exerciseAiPerHour: 100 } } });
      await resetAiDb(t);
    });
    afterAll(() => t.close());

    it("Básico, Intermediário e Avançado → a mesma tarefa, o mesmo nível, a mesma configuração e o mesmo modelo", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const cookie = await loginAs(t, teacher);
      const topic = await createConfirmedTopic(t, teacher.id);
      for (const difficulty of ["BASIC", "INTERMEDIATE", "ADVANCED"] as const) {
        expect((await requestBatch(t, cookie, batchRequest(topic, { difficulty }))).status).toBe(202);
      }
      const executions = await t.prisma.aiExecution.findMany({ select: { taskKey: true, tier: true, modelConfigId: true, model: true, selectionReason: true } });
      expect(executions).toHaveLength(3);
      expect(new Set(executions.map((execution) => JSON.stringify(execution))).size).toBe(1);
      expect(executions[0]!.taskKey).toBe("exercise-generation");
    });
  });
});
