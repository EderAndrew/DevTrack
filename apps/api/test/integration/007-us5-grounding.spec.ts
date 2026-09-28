import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type CurriculumExtractionOutputV2, CurriculumProposalContentSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { normalizeDocument } from "../../src/modules/syllabus/extraction/normalize";
import { type FakeStep, fakeEmpty, fakeOutput, fakeText, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, requestAnalysis, scriptCurriculumRun, seedGoldenDocument } from "../helpers/curriculum-ai";
import { createConfirmedRevision, createUser, loginAs, type TestUser } from "../helpers/factories";

const GOLDEN = resolve(__dirname, "../fixtures/curriculum-agent/golden");

/** The refs the read tool gives each block of a golden document, by the block's text. */
async function refsOf(name: string, file: string): Promise<(text: string) => string> {
  const blocks = await normalizeDocument(new Uint8Array(readFileSync(resolve(GOLDEN, name, file))), file.endsWith(".pdf") ? "PDF" : "DOCX");
  return (text) => {
    const block = blocks.find((candidate) => candidate.text.replace(/^[•\d.\s]+/u, "") === text);
    if (!block) throw new Error(`no block "${text}" in ${name}`);
    return block.ref;
  };
}

const item = (text: string, sourceRef: string | null = null) => ({ text, sourceRef });

/** What the model would answer for `minimo`, before the test adds anything. */
function minimoOutput(): CurriculumExtractionOutputV2 {
  return {
    title: "Tópicos de Orientação a Objetos",
    syllabusText: "Encapsulamento e herança.",
    competencyText: null,
    groups: [{ title: "Conceitos", items: [item("Encapsulamento"), item("Herança")] }],
    warnings: [{ code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null }],
    languageKey: null,
  };
}

const LINEARES = { title: "Estruturas lineares", items: [item("Listas encadeadas"), item("Pilhas e filas")] };
const HIERARQUICAS = { title: "Estruturas hierárquicas", items: [item("Árvores binárias de busca"), item("Heaps e filas de prioridade")] };
const SYLLABUS_TEXT =
  "Estudo das estruturas de dados lineares e hierárquicas, com análise de complexidade e implementação de listas, pilhas, filas e árvores.";

describe("007/US5 o resultado é fundamentado no documento", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
  });

  /** Runs the agent on `document` with `output` and returns the proposal's content. */
  async function analyse(document: SyllabusDocument, output: CurriculumExtractionOutputV2) {
    scriptCurriculumRun(t.provider, document.id, output);
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(execution.status).toBe("COMPLETED");
    return { proposal: execution.proposal!, content: CurriculumProposalContentSchema.parse(execution.proposal!.payload) };
  }

  it("007/US5-1 documento \"Encapsulamento e herança.\": \"Polimorfismo\" e \"Interfaces\" são marcados, e só eles", async () => {
    const { document } = await seedGoldenDocument(t, teacher.id, "minimo");
    const output = minimoOutput();
    output.groups[0]!.items.push(item("Polimorfismo"), item("Interfaces"));

    const { content } = await analyse(document, output);

    expect(content.grounding.unsupported).toEqual([
      { field: "item", groupIndex: 0, itemIndex: 2 },
      { field: "item", groupIndex: 0, itemIndex: 3 },
    ]);
    // The proposal keeps them for the teacher to see and decide: the check never removes (FR-021).
    expect(content.extraction.groups[0]!.items.map((entry) => entry.text)).toEqual(["Encapsulamento", "Herança", "Polimorfismo", "Interfaces"]);
  });

  describe("007/US5-2 007/FR-022 documento sem competência", () => {
    it("competência null com o aviso FIELD_NOT_FOUND na proposta, e nada marcado", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "sem-competencia");
      const { content } = await analyse(document, {
        title: "Estruturas de Dados",
        syllabusText: SYLLABUS_TEXT,
        competencyText: null,
        groups: [LINEARES, HIERARQUICAS],
        warnings: [{ code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null }],
        languageKey: null,
      });

      expect(content.extraction.competencyText).toBeNull();
      expect(content.extraction.warnings).toEqual([{ code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null }]);
      expect(content.grounding.unsupported).toEqual([]);
    });

    it("o modelo inventa uma competência → marcada UNSUPPORTED_CONTENT (grounding competencyText)", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "sem-competencia");
      const { content } = await analyse(document, {
        title: "Estruturas de Dados",
        syllabusText: SYLLABUS_TEXT,
        competencyText: "Projetar sistemas distribuídos tolerantes a falhas.",
        groups: [LINEARES, HIERARQUICAS],
        warnings: [],
        languageKey: null,
      });

      expect(content.grounding.unsupported).toEqual([{ field: "competencyText", groupIndex: null, itemIndex: null }]);
    });
  });

  describe("007/US5-5 007/FR-023 a origem de cada item", () => {
    it("PDF: origem p<página>.<linha> válida é mantida; p9.9 e a origem de outro bloco são descartadas", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "minimo");
      const ref = await refsOf("minimo", "document.pdf");
      const output = minimoOutput();
      output.groups[0]!.items = [
        item("Encapsulamento", ref("Encapsulamento")),
        // The title's block: a ref is kept only for its own block or the one right after it.
        item("Herança", ref("Tópicos de Orientação a Objetos")),
      ];
      output.groups.push({ title: null, items: [item("Herança", "p9.9")] });

      const { content } = await analyse(document, output);

      expect(ref("Encapsulamento")).toMatch(/^p1\.\d+$/);
      expect(content.extraction.groups.map((group) => group.items.map((entry) => entry.sourceRef))).toEqual([
        [ref("Encapsulamento"), null],
        [null],
      ]);
    });

    it("DOCX: origem par<n> mantida quando o parágrafo traz o item; ausente fica null, nunca inventada", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "sem-competencia");
      const ref = await refsOf("sem-competencia", "document.docx");
      const { content } = await analyse(document, {
        title: "Estruturas de Dados",
        syllabusText: SYLLABUS_TEXT,
        competencyText: null,
        groups: [
          { title: LINEARES.title, items: [item("Listas encadeadas", ref("Listas encadeadas")), item("Pilhas e filas", "par999")] },
          { title: HIERARQUICAS.title, items: [item("Árvores binárias de busca", null)] },
        ],
        warnings: [],
        languageKey: null,
      });

      expect(ref("Listas encadeadas")).toMatch(/^par\d+$/);
      expect(content.extraction.groups.map((group) => group.items.map((entry) => entry.sourceRef))).toEqual([
        [ref("Listas encadeadas"), null],
        [null],
      ]);
    });
  });

  describe("007/US5-6 007/SC-003 saída inválida → FAILED com o código da 006, sem proposta, ementa igual", () => {
    const valid = minimoOutput();
    const cases: [string, FakeStep, string][] = [
      ["não JSON", fakeText("Aqui está a ementa: título Tópicos"), "AI_OUTPUT_PARSE_FAILED"],
      ["fora do esquema", fakeOutput({ ...valid, title: 42 }), "AI_OUTPUT_VALIDATION_FAILED"],
      ["campo obrigatório ausente", fakeOutput({ title: valid.title, groups: valid.groups, warnings: [] }), "AI_OUTPUT_VALIDATION_FAILED"],
      ["item vazio", fakeOutput({ ...valid, groups: [{ title: "Conceitos", items: [item("")] }] }), "AI_OUTPUT_VALIDATION_FAILED"],
      ["código de aviso desconhecido", fakeOutput({ ...valid, warnings: [{ code: "INVENTED", field: null, groupIndex: null }] }), "AI_OUTPUT_VALIDATION_FAILED"],
      ["vazia", fakeEmpty(), "AI_OUTPUT_VALIDATION_FAILED"],
      ["max_tokens ou recusa (texto vazio)", fakeText(""), "AI_OUTPUT_VALIDATION_FAILED"],
      ["acima de 200 KB", fakeText(JSON.stringify({ ...valid, syllabusText: "x".repeat(210 * 1024) })), "AI_EXECUTION_LIMIT_EXCEEDED"],
    ];

    it.each(cases)("%s", async (_label, answer, code) => {
      const { document } = await seedGoldenDocument(t, teacher.id, "minimo");
      await createConfirmedRevision(t, document.id, [{ title: "Conceitos", items: ["Encapsulamento"] }]);
      const revisions = await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" }, include: { groups: { include: { items: true } } } });
      t.provider.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: document.id }), answer);

      const { body } = await requestAnalysis(t, cookie, document.id);
      await drain(t);

      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
      expect({ status: execution.status, errorCode: execution.errorCode, proposal: execution.proposal }).toEqual({
        status: "FAILED",
        errorCode: code,
        proposal: null,
      });
      expect(await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" }, include: { groups: { include: { items: true } } } })).toEqual(revisions);
    });
  });

  describe("007/FR-024 a ordem e as repetições são as da saída", () => {
    it("seção duplicada: as duas cópias ficam, na ordem, com o aviso do modelo", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "secao-duplicada");
      const { proposal, content } = await analyse(document, {
        title: "Estruturas de Dados",
        syllabusText: SYLLABUS_TEXT,
        competencyText: "Selecionar e implementar a estrutura de dados adequada a cada problema, justificando o custo das operações.",
        groups: [LINEARES, HIERARQUICAS, LINEARES],
        warnings: [{ code: "POSSIBLE_DUPLICATE_CONTENT", field: "groups", groupIndex: 2 }],
        languageKey: null,
      });

      expect(content.extraction.groups.map((group) => group.title)).toEqual(["Estruturas lineares", "Estruturas hierárquicas", "Estruturas lineares"]);
      expect(content.extraction.warnings).toEqual([{ code: "POSSIBLE_DUPLICATE_CONTENT", field: "groups", groupIndex: 2 }]);
      expect(content.grounding.unsupported).toEqual([]);
      expect(proposal.itemIds).toEqual(["title", "syllabusText", "competencyText", "group:0", "group:1", "group:2"]);
    });

    it("grupos e itens numa ordem diferente da do documento → a proposta mantém a ordem da saída", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "secao-duplicada");
      const reversed = { title: HIERARQUICAS.title, items: [...HIERARQUICAS.items].reverse() };
      const { content } = await analyse(document, {
        title: null,
        syllabusText: null,
        competencyText: null,
        groups: [reversed, LINEARES],
        warnings: [],
        languageKey: null,
      });

      expect(content.extraction.groups.map((group) => [group.title, group.items.map((entry) => entry.text)])).toEqual([
        ["Estruturas hierárquicas", ["Heaps e filas de prioridade", "Árvores binárias de busca"]],
        ["Estruturas lineares", ["Listas encadeadas", "Pilhas e filas"]],
      ]);
    });
  });
});
