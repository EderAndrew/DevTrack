import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "../helpers/env";

// 006/FR-001 (research A15): only the AI foundation talks to models. The lint rule shows it in
// the editor; this guard runs the real config and scans the sources so the rule can't be turned
// off in silence. The shared config turns errors into warnings and `pnpm lint` runs with
// --max-warnings 0, so any report fails CI.

const REPO = resolve(API_ROOT, "../..");
const WEB = resolve(REPO, "apps/web");
const eslint = new ESLint({ cwd: API_ROOT });

const SDKS = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/genai",
  "@google/generative-ai",
  "ai",
  "@ai-sdk/openai",
  "langchain",
  "@langchain/core",
  "ollama",
  "cohere-ai",
  "@mistralai/mistralai",
  "groq-sdk",
  "replicate",
];
const SDK_NAME = /^(openai|@anthropic-ai\/.+|@google\/genai|@google\/generative-ai|ai|@ai-sdk\/.+|langchain|@langchain\/.+|ollama|cohere-ai|@mistralai\/.+|groq-sdk|replicate)(\/.*)?$/;
const PROVIDER_HOSTS = /openrouter\.ai|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.groq\.com|api\.cohere\.(ai|com)/;
const PROVIDERS_DIR = "src/modules/ai/gateway/providers/";

async function restrictedImports(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: true });
  return result!.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", "dist", ".next", "generated", ".tmp", "coverage"].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(path);
    }
  };
  walk(root);
  return out;
}

const importsOf = (text: string) =>
  [...text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]!);

describe("006/FR-001 006/SC-002 só a fundação de IA fala com modelos", () => {
  it.each(SDKS)("importar %s num módulo de domínio é recusado pelo lint", async (sdk) => {
    const code = `import x from "${sdk}";\nexport const y = x;\n`;
    expect(await restrictedImports("src/modules/subjects/a.ts", code)).not.toEqual([]);
    expect(await restrictedImports("src/modules/subjects/subjects.controller.ts", code)).not.toEqual([]);
    expect(await restrictedImports("src/modules/ai/execution/a.ts", code)).not.toEqual([]);
  });

  it("um adaptador em src/modules/ai/gateway/providers pode importar o SDK", async () => {
    const code = 'import OpenAI from "openai";\nexport const y = OpenAI;\n';
    expect(await restrictedImports("src/modules/ai/gateway/providers/x/x.provider.ts", code)).toEqual([]);
  });

  it("008/FR-024 nenhum arquivo importa o @anthropic-ai/*, e o lint o recusa fora dos adaptadores", async () => {
    const code = 'import Anthropic from "@anthropic-ai/sdk";\nexport const y = Anthropic;\n';
    for (const path of ["src/modules/curriculum-ai/curriculum-ai-request.service.ts", "src/modules/ai/definitions/index.ts", "src/modules/ai/gateway/model-gateway.ts"]) {
      expect(await restrictedImports(path, code), path).not.toEqual([]);
    }
    const importers = sourceFiles(resolve(API_ROOT, "src"))
      .filter((file) => importsOf(readFileSync(file, "utf8")).some((specifier) => specifier.startsWith("@anthropic-ai/")))
      .map((file) => relative(API_ROOT, file));
    expect(importers).toEqual([]);
  });

  it("008/FR-024 o host do OpenRouter aparece só no adaptador openrouter.provider.ts", () => {
    const citing = sourceFiles(resolve(API_ROOT, "src"))
      .filter((file) => !file.endsWith(".spec.ts") && /openrouter\.ai/.test(readFileSync(file, "utf8")))
      .map((file) => relative(API_ROOT, file));
    expect(citing).toEqual([`${PROVIDERS_DIR}openrouter.provider.ts`]);
  });

  it("fora de src/modules/ai, os internos (gateway, ferramentas, validador, registro) são recusados", async () => {
    for (const path of ["../ai/gateway/model-gateway", "../ai/tools/ai-tool-executor", "../ai/registry/ai-registry.sync", "../ai/output/x"]) {
      const code = `import { X } from "${path}";\nexport const y = X;\n`;
      expect(await restrictedImports("src/modules/subjects/a.ts", code), path).not.toEqual([]);
    }
    const allowed = 'import { AiModule } from "./modules/ai/ai.module";\nexport const y = AiModule;\n';
    expect(await restrictedImports("src/app.module.ts", allowed)).toEqual([]);
  });

  it("controllers continuam proibidos de importar Prisma (a regra da 001 não se perdeu)", async () => {
    const code = 'import { PrismaService } from "../../platform/database/prisma.service";\nexport const y = PrismaService;\n';
    expect(await restrictedImports("src/modules/subjects/subjects.controller.ts", code)).not.toEqual([]);
  });

  it("nenhum arquivo da API ou do web importa um SDK de provedor nem cita o host de um provedor fora dos adaptadores", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(resolve(API_ROOT, "src")), ...sourceFiles(WEB)]) {
      const rel = relative(REPO, file);
      if (rel.startsWith(`apps/api/${PROVIDERS_DIR}`)) continue;
      const text = readFileSync(file, "utf8");
      for (const specifier of importsOf(text)) if (SDK_NAME.test(specifier)) offenders.push(`${rel}: ${specifier}`);
      if (PROVIDER_HOSTS.test(text) && !rel.endsWith("006-ai-boundary.spec.ts")) offenders.push(`${rel}: host de provedor`);
    }
    expect(offenders).toEqual([]);
  });

  it("006/FR-016 008/FR-024 nem a API nem o web dependem de SDK de provedor (o OpenRouter usa fetch)", () => {
    const allowed = { "apps/api/package.json": [], "apps/web/package.json": [] };
    for (const [pkg, expected] of Object.entries(allowed)) {
      const json = JSON.parse(readFileSync(resolve(REPO, pkg), "utf8")) as Record<string, Record<string, string> | undefined>;
      const deps = Object.keys({ ...json.dependencies, ...json.devDependencies });
      expect(deps.filter((name) => SDK_NAME.test(name)), pkg).toEqual(expected);
    }
  });

  it("006/FR-044 o módulo de IA só grava nas próprias tabelas ai_*", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(resolve(API_ROOT, "src/modules/ai"))) {
      if (file.endsWith(".spec.ts")) continue;
      const rel = relative(REPO, file);
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b(?:tx|prisma|db)\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g)) {
        if (!m[1]!.startsWith("ai")) offenders.push(`${rel}: ${m[1]}.${m[2]}`);
      }
      for (const m of text.matchAll(/(?<!FOR\s)\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(\w+)"?/gi)) {
        if (!m[1]!.startsWith("ai_")) offenders.push(`${rel}: SQL em ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
