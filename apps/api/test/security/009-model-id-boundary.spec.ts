import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import { MODEL_CATALOG } from "../../src/modules/ai/definitions/model-catalog";
import type { CatalogModel } from "../../src/modules/ai/definitions/types";
import { loadConfig } from "../../src/platform/config/config.schema";
import { API_ROOT } from "../helpers/env";
import { testConfig } from "../helpers/test-app";

// 009/FR-007 (research H2): concrete model ids live only in the catalog file. Agents name a task,
// tasks name a tier and families, and the adapter names only OpenRouter's routes. Unit specs
// (`*.spec.ts`) are test code and may use ids of their own.

const CATALOG_FILE = "src/modules/ai/definitions/model-catalog.ts";
const ADAPTER_DIR = "src/modules/ai/gateway/providers/";

/** A vendor-prefixed OpenRouter id, or a bare model name of a known vendor. */
const MODEL_ID =
  /\b(?:openai|anthropic|typesafe|google|meta-llama|mistralai|x-ai|deepseek|qwen|cohere|openrouter)\/[a-z0-9][a-z0-9._:-]*|\b(?:claude|gpt|jev|gemini|llama|mistral|grok)-[0-9a-z]/i;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "generated") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) out.push(path);
  }
  return out;
}

describe("009/FR-007 009/US3-3 ids concretos de modelo só no catálogo", () => {
  it("nenhum arquivo de apps/api/src fora do catálogo e do adaptador contém id de modelo", () => {
    const offenders = sources(join(API_ROOT, "src"))
      .map((path) => relative(API_ROOT, path))
      .filter((path) => path !== CATALOG_FILE && !path.startsWith(ADAPTER_DIR))
      .flatMap((path) =>
        readFileSync(join(API_ROOT, path), "utf8")
          .split("\n")
          .flatMap((line, index) => (MODEL_ID.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [])),
      );
    expect(offenders).toEqual([]);
  });

  it("o adaptador não fixa modelo: usa o que o pedido traz", () => {
    const adapter = readFileSync(join(API_ROOT, ADAPTER_DIR, "openrouter.provider.ts"), "utf8");
    expect(adapter.split("\n").filter((line) => MODEL_ID.test(line))).toEqual([]);
  });

  it("o agente de produção só nomeia a tarefa: nem modelo, nem configuração, nem nível, nem família", () => {
    for (const agent of productionAiDefinitions(testConfig()).agents) {
      expect(agent.taskKey).toEqual(expect.any(String));
      for (const field of ["model", "modelConfigKey", "tier", "preferredTier", "family", "families", "allowedFamilies"]) {
        expect(agent, `${agent.key}.${field}`).not.toHaveProperty(field);
      }
    }
  });
});

/** The catalog entries as production registers them, less the timeout `OPENROUTER_TIMEOUT_MS` caps. */
const entriesOf = (entries: readonly CatalogModel[]) => entries.map(({ timeoutMs: _timeoutMs, ...entry }) => entry);

describe("009/US1-3 009/FR-004 nada entra no catálogo por fora do arquivo", () => {
  it("as definições de produção usam exatamente o catálogo do arquivo", () => {
    expect(entriesOf(productionAiDefinitions(testConfig()).modelConfigs)).toEqual(entriesOf(MODEL_CATALOG));
  });

  it("uma variável de modelo ainda definida é ignorada: o catálogo não muda", () => {
    const config = loadConfig({ ...process.env, OPENROUTER_DEFAULT_MODEL: "openai/modelo-por-variavel", OPENROUTER_FALLBACK_MODEL: "anthropic/outro" });
    expect(config.ai.ignoredVariables).toEqual(["OPENROUTER_DEFAULT_MODEL", "OPENROUTER_FALLBACK_MODEL"]);
    expect(entriesOf(productionAiDefinitions(config).modelConfigs)).toEqual(entriesOf(MODEL_CATALOG));
    expect(JSON.stringify(config)).not.toContain("modelo-por-variavel");
  });

  it("uma entrada só está em PRODUCTION com aprovação registrada no arquivo", () => {
    for (const entry of MODEL_CATALOG) {
      if (entry.lifecycle !== "PRODUCTION") continue;
      expect(entry.approvals ?? [], entry.key).not.toEqual([]);
    }
  });
});
