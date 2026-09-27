import { describe, expect, it } from "vitest";
import type { ModelTier } from "../definitions/model-families";
import { type EntryHealth, type PolicyCatalogEntry, type SelectRouteInput, selectRoute } from "./select-route";
import type { TaskPolicyFields } from "./task-policy";

const FAMILIES = ["openai", "anthropic", "typesafe"];

const GENERATION_CAPABILITIES = { structuredOutput: true, tools: true, vision: false, reasoning: false };

const entry = (key: string, change: Partial<PolicyCatalogEntry> = {}): PolicyCatalogEntry => ({
  key,
  family: "anthropic",
  mode: "GENERATION",
  tier: "BASIC",
  lifecycle: "PRODUCTION",
  capabilities: GENERATION_CAPABILITIES,
  price: { inputPerMTok: "1", outputPerMTok: "5", currency: "USD" },
  priority: 0,
  approved: true,
  ...change,
});

const GENERATION_TASK: TaskPolicyFields = {
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  allowedFamilies: ["openai", "anthropic"],
  requiredCapabilities: ["structuredOutput"],
  fallback: "SAME_TIER",
  escalation: "NONE",
  quality: { schemaValidity: 1 },
  typicalUsage: { inputTokens: 1000, outputTokens: 100 },
};

const DECISION_TASK: TaskPolicyFields = {
  ...GENERATION_TASK,
  mode: "DECISION",
  allowedFamilies: ["typesafe"],
  requiredCapabilities: [],
  minConfidence: 0.7,
};

const JEV = entry("typesafe-decision-basic", {
  family: "typesafe",
  mode: "DECISION",
  capabilities: { structuredOutput: false, tools: false, vision: false, reasoning: false },
  price: null,
});

function select(catalog: PolicyCatalogEntry[], change: Partial<SelectRouteInput<PolicyCatalogEntry>> = {}) {
  return selectRoute<PolicyCatalogEntry>({
    task: GENERATION_TASK,
    tier: "BASIC" as ModelTier,
    families: FAMILIES,
    catalog,
    override: null,
    health: (): EntryHealth => "USABLE",
    ...change,
  });
}

/** Every key the route may call (primary and fallback). */
const keysOf = (route: ReturnType<typeof select>) => ("unavailable" in route ? [] : [route.primary.key, route.fallback?.key].filter(Boolean));

describe("009/US1-2 009/FR-003 só famílias da allowlist e da tarefa", () => {
  it("uma família fora da allowlist em vigor nunca é escolhida, nem como fallback", () => {
    const mistral = entry("mistral-basic", { family: "mistral", price: { inputPerMTok: "0.01", outputPerMTok: "0.01", currency: "USD" } });
    const route = select([mistral, entry("anthropic-basic"), entry("openai-basic", { family: "openai" })], {
      task: { ...GENERATION_TASK, allowedFamilies: ["openai", "anthropic"] },
    });
    expect(keysOf(route)).not.toContain("mistral-basic");
    expect(keysOf(route)).toHaveLength(2);
  });

  it("uma família da allowlist que a tarefa não permite nunca é escolhida", () => {
    const route = select([entry("openai-basic", { family: "openai", price: { inputPerMTok: "0.1", outputPerMTok: "0.1", currency: "USD" } }), entry("anthropic-basic")], {
      task: { ...GENERATION_TASK, allowedFamilies: ["anthropic"] },
    });
    expect(keysOf(route)).toEqual(["anthropic-basic"]);
  });

  it("só modelos de família fora da allowlist → indisponível", () => {
    expect(select([entry("mistral-basic", { family: "mistral" })])).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });

  it("uma tarefa que permite família fora da allowlist tem a política inválida", () => {
    expect(select([entry("anthropic-basic")], { task: { ...GENERATION_TASK, allowedFamilies: ["anthropic", "mistral"] } })).toEqual({ unavailable: "POLICY_INVALID" });
  });
});

describe("009/US1-1 modelo fora do catálogo nunca é usado", () => {
  it("um override que não é entrada do catálogo é ignorado; a escolha segue a política", () => {
    const route = select([entry("anthropic-basic")], { override: "openai/modelo-fora-do-catalogo" });
    expect(route).toMatchObject({ primary: { key: "anthropic-basic" }, reason: "ONLY_CANDIDATE", overrideIgnored: true });
  });

  it("sem entradas no catálogo → indisponível, nunca um modelo por fora", () => {
    expect(select([])).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });

  it("um override de entrada que não se qualifica (outra família) é ignorado", () => {
    const route = select([entry("anthropic-basic"), entry("typesafe-x", { family: "typesafe" })], { override: "typesafe-x" });
    expect(route).toMatchObject({ primary: { key: "anthropic-basic" }, overrideIgnored: true });
  });
});

describe("009/FR-001a o modo do modelo é o modo da tarefa", () => {
  it("um modelo de decisão nunca atende tarefa de geração", () => {
    expect(select([JEV])).toEqual({ unavailable: "NO_APPROVED_MODEL" });
    expect(keysOf(select([JEV, entry("anthropic-basic")], { task: { ...GENERATION_TASK, allowedFamilies: ["anthropic"] } }))).toEqual(["anthropic-basic"]);
  });

  it("um modelo de geração nunca atende tarefa de decisão", () => {
    const anthropic = entry("anthropic-basic");
    expect(keysOf(select([anthropic, JEV], { task: { ...DECISION_TASK, allowedFamilies: ["typesafe", "anthropic"] } }))).toEqual(["typesafe-decision-basic"]);
    expect(select([anthropic], { task: { ...DECISION_TASK, allowedFamilies: ["anthropic"] } })).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });

  it("uma tarefa de decisão escolhe o modelo de decisão aprovado", () => {
    expect(select([JEV], { task: DECISION_TASK })).toMatchObject({ primary: { key: JEV.key }, fallback: null, reason: "ONLY_CANDIDATE" });
  });
});

describe("009/FR-003 capacidades exigidas pela tarefa", () => {
  it("um modelo sem uma capacidade exigida nunca é escolhido", () => {
    const noTools = entry("anthropic-basic", { capabilities: { ...GENERATION_CAPABILITIES, tools: false } });
    const route = select([noTools, entry("openai-basic", { family: "openai" })], { task: { ...GENERATION_TASK, requiredCapabilities: ["structuredOutput", "tools"] } });
    expect(keysOf(route)).toEqual(["openai-basic"]);
  });

  it("sem nenhum modelo com as capacidades → indisponível", () => {
    const route = select([entry("anthropic-basic", { capabilities: { ...GENERATION_CAPABILITIES, vision: false } })], {
      task: { ...GENERATION_TASK, requiredCapabilities: ["vision"] },
    });
    expect(route).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });
});

const price = (inputPerMTok: string, outputPerMTok: string) => ({ inputPerMTok, outputPerMTok, currency: "USD" });

/** Every entry below qualifies for the task but for what each test changes: family `anthropic`, approved, PRODUCTION. */
const basic = (key: string, change: Partial<PolicyCatalogEntry> = {}) => entry(key, { family: "anthropic", ...change });

describe("009/US2-1 009/SC-003 a tarefa recebe o nível que pede, nunca um maior", () => {
  const tiers = [
    basic("basic-a", { price: price("1", "5") }),
    basic("standard-a", { tier: "STANDARD", price: price("0.01", "0.01") }),
    basic("advanced-a", { tier: "ADVANCED", price: price("0.001", "0.001"), priority: 99 }),
  ];

  it("uma tarefa BASIC com modelos BASIC, STANDARD e ADVANCED aprovados recebe o BASIC, mesmo mais caro", () => {
    expect(select(tiers)).toMatchObject({ primary: { key: "basic-a", tier: "BASIC" }, fallback: null });
  });

  it("o fallback é do mesmo nível: sem outro BASIC, não há fallback", () => {
    const route = select(tiers);
    expect("unavailable" in route ? null : route.fallback).toBeNull();
  });

  it("só modelos de nível maior → indisponível, nunca um nível acima sem regra explícita", () => {
    expect(select(tiers.slice(1))).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });

  it("pedida no nível STANDARD (destino de escalonamento), a escolha fica nesse nível", () => {
    expect(select(tiers, { tier: "STANDARD" })).toMatchObject({ primary: { key: "standard-a" } });
  });
});

describe("009/US2-2 009/FR-008 009/SC-004 o mais barato entre os aprovados do nível", () => {
  it("três modelos BASIC com custos diferentes → o de menor custo estimado, motivo LOWEST_COST", () => {
    const route = select([
      basic("mid", { price: price("1", "4"), priority: 5 }),
      basic("cheap", { price: price("0.5", "2") }),
      basic("pricey", { price: price("3", "15"), priority: 9 }),
    ]);
    expect(route).toMatchObject({ primary: { key: "cheap" }, fallback: { key: "mid" }, reason: "LOWEST_COST" });
  });

  it("o custo é o do uso típico da tarefa: entrada barata não vence numa tarefa de muita saída", () => {
    const catalog = [basic("cheap-input", { price: price("0.1", "20") }), basic("cheap-output", { price: price("2", "2") })];
    expect(select(catalog, { task: { ...GENERATION_TASK, typicalUsage: { inputTokens: 100, outputTokens: 5000 } } })).toMatchObject({ primary: { key: "cheap-output" } });
    expect(select(catalog, { task: { ...GENERATION_TASK, typicalUsage: { inputTokens: 50_000, outputTokens: 10 } } })).toMatchObject({ primary: { key: "cheap-input" } });
  });

  it("mesmo custo → maior prioridade primeiro", () => {
    const route = select([basic("a-low", { priority: 1 }), basic("z-high", { priority: 7 })]);
    expect(route).toMatchObject({ primary: { key: "z-high" }, fallback: { key: "a-low" } });
  });

  it("mesmo custo e prioridade → pela chave, sempre igual", () => {
    const route = select([basic("model-b"), basic("model-c"), basic("model-a")]);
    expect(route).toMatchObject({ primary: { key: "model-a" }, fallback: { key: "model-b" } });
  });

  it("sem preço vem depois dos com preço, qualquer que seja a prioridade", () => {
    const route = select([basic("unpriced", { price: null, priority: 99 }), basic("priced", { price: price("50", "100") })]);
    expect(route).toMatchObject({ primary: { key: "priced" }, fallback: { key: "unpriced" } });
  });

  it("só modelos sem preço: prioridade e depois chave", () => {
    const route = select([basic("b", { price: null }), basic("a", { price: null }), basic("c", { price: null, priority: 3 })]);
    expect(route).toMatchObject({ primary: { key: "c" }, fallback: { key: "a" } });
  });
});

describe("009/US2-3 009/FR-009 009/SC-004 qualidade antes do custo", () => {
  it("um modelo BASIC mais barato sem aprovação válida para a tarefa é ignorado", () => {
    const route = select([basic("cheap-unapproved", { price: price("0.01", "0.01"), approved: false }), basic("approved", { price: price("3", "15") })]);
    expect(route).toMatchObject({ primary: { key: "approved" }, fallback: null, reason: "ONLY_CANDIDATE" });
  });

  it.each(["CANDIDATE", "EVALUATING"] as const)("um modelo %s, mesmo aprovado e mais barato, nunca é escolhido", (lifecycle) => {
    const route = select([basic("cheap", { lifecycle, price: price("0.01", "0.01") }), basic("production", { price: price("3", "15") })]);
    expect(keysOf(route)).toEqual(["production"]);
  });

  it("DEPRECATED só na falta de PRODUCTION: nunca à frente, e o motivo diz", () => {
    const deprecated = basic("old", { lifecycle: "DEPRECATED", price: price("0.01", "0.01") });
    expect(select([deprecated, basic("current", { price: price("3", "15") })])).toMatchObject({ primary: { key: "current" }, fallback: { key: "old" } });
    expect(select([deprecated])).toMatchObject({ primary: { key: "old" }, reason: "DEPRECATED_ONLY" });
  });

  it("nunca 'o mais barato entre todos' nem 'o mais poderoso': o mais barato de outra família da tarefa ou de outro nível não conta", () => {
    const route = select(
      [
        basic("openai-cheap", { family: "openai", price: price("0.01", "0.01") }),
        basic("anthropic-advanced", { tier: "ADVANCED", price: price("0.001", "0.001") }),
        basic("anthropic-basic", { price: price("3", "15") }),
      ],
      { task: { ...GENERATION_TASK, allowedFamilies: ["anthropic"] } },
    );
    expect(keysOf(route)).toEqual(["anthropic-basic"]);
  });

  it("um modelo desabilitado ou de circuito aberto nunca vira fallback; todos bloqueados → indisponível", () => {
    const catalog = [basic("a"), basic("b"), basic("c")];
    const route = select(catalog, { health: (e) => (e.key === "b" ? "BLOCKED" : "USABLE") });
    expect(route).toMatchObject({ primary: { key: "a" }, fallback: { key: "c" } });
    expect(select(catalog, { health: () => "BLOCKED" })).toEqual({ unavailable: "ALL_BLOCKED" });
    expect(select(catalog, { health: () => "NO_PROVIDER" })).toEqual({ unavailable: "PROVIDER_NOT_REGISTERED" });
  });
});

describe("009/US2-4 saída estruturada exigida", () => {
  it("só modelos com saída estruturada são considerados, por mais baratos que os outros sejam", () => {
    const route = select([
      basic("no-structured", { capabilities: { ...GENERATION_CAPABILITIES, structuredOutput: false }, price: price("0.01", "0.01") }),
      basic("structured", { price: price("3", "15") }),
    ]);
    expect(keysOf(route)).toEqual(["structured"]);
  });
});

describe("009/US2-5 sem candidato a tarefa fica indisponível", () => {
  it.each([
    ["nenhum aprovado", [basic("a", { approved: false })]],
    ["só CANDIDATE", [basic("a", { lifecycle: "CANDIDATE" })]],
    ["só de outro nível", [basic("a", { tier: "STANDARD" })]],
    ["catálogo vazio", []],
  ])("%s → NO_APPROVED_MODEL", (_name, catalog) => {
    expect(select(catalog)).toEqual({ unavailable: "NO_APPROVED_MODEL" });
  });
});

describe("009/US2-6 009/SC-002 mesma entrada → mesma escolha", () => {
  const catalog = [
    basic("p1", { price: price("1", "5"), priority: 2 }),
    basic("p2", { price: price("1", "5"), priority: 2 }),
    basic("p3", { family: "openai", price: price("1", "5"), priority: 2 }),
    basic("p4", { price: null, priority: 9 }),
    basic("p5", { price: price("0.2", "1"), approved: false }),
  ];

  it("repetida muitas vezes, a escolha é idêntica", () => {
    const first = select(catalog);
    for (let i = 0; i < 50; i += 1) expect(select(catalog)).toEqual(first);
    expect(first).toMatchObject({ primary: { key: "p1" }, fallback: { key: "p3" }, reason: "LOWEST_COST" });
  });

  it("a ordem em que o catálogo chega não muda a escolha (outra instância, outra ordem de leitura)", () => {
    const expected = select(catalog);
    for (const permutation of [[...catalog].reverse(), [catalog[2]!, catalog[4]!, catalog[0]!, catalog[3]!, catalog[1]!]]) {
      expect(select(permutation)).toEqual(expected);
    }
  });
});

describe("009/US4-1 009/US4-2 009/FR-012 fallback do mesmo nível, de outra família quando existe", () => {
  it("o fallback é o próximo aprovado de outra família, mesmo que um da mesma família seja mais barato", () => {
    const route = select([
      basic("anthropic-a", { price: price("1", "1") }),
      basic("anthropic-b", { price: price("1.1", "1.1") }),
      basic("openai-a", { family: "openai", price: price("5", "5") }),
    ]);
    expect(route).toMatchObject({ primary: { key: "anthropic-a" }, fallback: { key: "openai-a", tier: "BASIC" } });
  });

  it("sem outra família, o fallback é o próximo da mesma família e do mesmo nível", () => {
    expect(select([basic("anthropic-a"), basic("anthropic-b", { priority: -1 })])).toMatchObject({ fallback: { key: "anthropic-b", family: "anthropic" } });
  });

  it("um fallback possível só em outro nível não existe: sem fallback", () => {
    const route = select([basic("basic-a"), basic("standard-openai", { family: "openai", tier: "STANDARD" }), basic("advanced-a", { tier: "ADVANCED" })]);
    expect(route).toMatchObject({ primary: { key: "basic-a" }, fallback: null });
  });

  it("nunca de família fora da tarefa ou da allowlist, nem de outro modo", () => {
    const route = select(
      [
        basic("anthropic-a"),
        basic("openai-not-allowed", { family: "openai" }),
        basic("mistral-a", { family: "mistral" }),
        basic("typesafe-decision", { family: "typesafe", mode: "DECISION", capabilities: JEV.capabilities }),
      ],
      { task: { ...GENERATION_TASK, allowedFamilies: ["anthropic"] } },
    );
    expect(route).toMatchObject({ primary: { key: "anthropic-a" }, fallback: null });
  });

  it("uma tarefa sem fallback (NONE) nunca recebe um, mesmo com candidatos", () => {
    expect(select([basic("a"), basic("b", { family: "openai" })], { task: { ...GENERATION_TASK, fallback: "NONE" } })).toMatchObject({ fallback: null });
  });

  it("o fallback de uma rota de escalonamento é do nível de destino", () => {
    const route = select(
      [basic("basic-a"), basic("standard-a", { tier: "STANDARD" }), basic("standard-openai", { tier: "STANDARD", family: "openai", price: price("9", "9") })],
      { tier: "STANDARD" },
    );
    expect(route).toMatchObject({ primary: { key: "standard-a" }, fallback: { key: "standard-openai", tier: "STANDARD" } });
  });
});
