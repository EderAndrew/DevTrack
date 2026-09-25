import { describe, expect, it } from "vitest";
import {
  ApplyCurriculumProposalRequestSchema,
  CurriculumAiStatusSchema,
  CurriculumExtractionOutputSchema,
  CurriculumItemIdSchema,
  CurriculumProposalContentSchema,
  CurriculumReviewWarningCodeSchema,
  CurriculumSourceRefSchema,
  CurriculumWarningCodeSchema,
  MAX_ITEMS_PER_REVISION,
  RequestCurriculumAnalysisRequestSchema,
  SaveSyllabusRevisionRequestSchema,
} from "../src/index.js";

const ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const SHA = "a".repeat(64);

const output = {
  title: "Programação Orientada a Objetos",
  syllabusText: "Exploração dos princípios da POO.",
  competencyText: "Capacitar os alunos a projetar soluções.",
  groups: [
    {
      title: "Fundamentos de POO",
      items: [
        { text: "Conceitos de classes, objetos e métodos.", sourceRef: "p1.12" },
        { text: "Encapsulamento, herança e polimorfismo.", sourceRef: null },
      ],
    },
  ],
  warnings: [],
};

const content = {
  extraction: output,
  grounding: { unsupported: [{ field: "item", groupIndex: 0, itemIndex: 1 }] },
  source: { documentId: ID, sha256: SHA, readerVersion: 1 },
};

describe("007 contratos do Curriculum Agent", () => {
  describe("007/FR-004 saída estruturada do agente", () => {
    it("aceita a saída completa e campos nulos quando não encontrados", () => {
      expect(CurriculumExtractionOutputSchema.safeParse(output).success).toBe(true);
      const empty = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [] };
      expect(CurriculumExtractionOutputSchema.safeParse(empty).success).toBe(true);
    });

    it("todo campo é obrigatório (null quando ausente) e campo extra é recusado", () => {
      const { title: _title, ...withoutTitle } = output;
      expect(CurriculumExtractionOutputSchema.safeParse(withoutTitle).success).toBe(false);
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, workload: "80h" }).success).toBe(false);
    });

    it("recusa campo de confiança na saída, no grupo e no item", () => {
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, confidence: 0.99 }).success).toBe(false);
      const group = { ...output.groups[0]!, confidence: 0.9 };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, groups: [group] }).success).toBe(false);
      const item = { text: "Herança", sourceRef: null, confidence: 0.9 };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, groups: [{ title: null, items: [item] }] }).success).toBe(false);
    });

    it("avisos só com código conhecido, sem mensagem livre", () => {
      const warning = { code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, warnings: [warning] }).success).toBe(true);
      const unknown = { ...warning, code: "MISSING_WORKLOAD" };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, warnings: [unknown] }).success).toBe(false);
      const withMessage = { ...warning, message: "Competência não encontrada." };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, warnings: [withMessage] }).success).toBe(false);
      // UNSUPPORTED_CONTENT comes from the grounding check, never from the model (FR-021).
      const system = { ...warning, code: "UNSUPPORTED_CONTENT" };
      expect(CurriculumExtractionOutputSchema.safeParse({ ...output, warnings: [system] }).success).toBe(false);
    });

    it("os códigos de aviso são os 6 do modelo, e a revisão acrescenta UNSUPPORTED_CONTENT", () => {
      expect(CurriculumWarningCodeSchema.options).toEqual([
        "FIELD_NOT_FOUND",
        "AMBIGUOUS_STRUCTURE",
        "LOW_DOCUMENT_QUALITY",
        "INCOMPLETE_SECTION",
        "UNREADABLE_CONTENT",
        "POSSIBLE_DUPLICATE_CONTENT",
      ]);
      expect(CurriculumReviewWarningCodeSchema.options).toEqual([...CurriculumWarningCodeSchema.options, "UNSUPPORTED_CONTENT"]);
    });

    it("limites iguais aos do rascunho da 004: toda saída válida cabe num rascunho", () => {
      const cases: [Record<string, unknown>, boolean][] = [
        [{ title: "t".repeat(200) }, true],
        [{ title: "t".repeat(201) }, false],
        [{ title: "" }, false],
        [{ syllabusText: "s".repeat(10_000) }, true],
        [{ syllabusText: "s".repeat(10_001) }, false],
        [{ competencyText: "c".repeat(10_001) }, false],
        [{ groups: [{ title: "g".repeat(300), items: [{ text: "i".repeat(1000), sourceRef: null }] }] }, true],
        [{ groups: [{ title: "g".repeat(301), items: [{ text: "i", sourceRef: null }] }] }, false],
        [{ groups: [{ title: null, items: [{ text: "i".repeat(1001), sourceRef: null }] }] }, false],
        [{ groups: [{ title: null, items: [] }] }, false],
      ];
      for (const [patch, ok] of cases) {
        const value = { ...output, ...patch };
        expect(CurriculumExtractionOutputSchema.safeParse(value).success, JSON.stringify(patch).slice(0, 60)).toBe(ok);
        if (ok) {
          const { warnings: _warnings, ...fields } = value;
          const draft = { ...fields, groups: value.groups.map((g) => ({ title: g.title, items: g.items.map((i) => ({ text: i.text })) })) };
          expect(SaveSyllabusRevisionRequestSchema.safeParse(draft).success).toBe(true);
        }
      }
    });

    it(`total de itens ≤ MAX_ITEMS_PER_REVISION (${MAX_ITEMS_PER_REVISION})`, () => {
      const group = (n: number) => ({ title: null, items: Array.from({ length: n }, (_, i) => ({ text: `i${i}`, sourceRef: null })) });
      const fits = { ...output, groups: [group(200), group(200), group(100)] };
      expect(CurriculumExtractionOutputSchema.safeParse(fits).success).toBe(true);
      const over = { ...output, groups: [group(200), group(200), group(101)] };
      expect(CurriculumExtractionOutputSchema.safeParse(over).success).toBe(false);
    });

    it("referência de origem só no formato página.linha ou parágrafo", () => {
      for (const ref of ["p1.1", "p12.345", "par1", "par999"]) expect(CurriculumSourceRefSchema.safeParse(ref).success, ref).toBe(true);
      for (const ref of ["page:1", "p1", "par", "p1.x", "P1.1", "par1 ", "x".repeat(21)]) {
        expect(CurriculumSourceRefSchema.safeParse(ref).success, ref).toBe(false);
      }
    });
  });

  describe("conteúdo da proposta", () => {
    it("aceita extração, verificação de apoio e origem", () => {
      expect(CurriculumProposalContentSchema.safeParse(content).success).toBe(true);
    });

    it("origem exige sha256 hexadecimal de 64 caracteres e readerVersion 1", () => {
      const bad = [
        { ...content.source, sha256: "abc" },
        { ...content.source, sha256: "G".repeat(64) },
        { ...content.source, readerVersion: 2 },
      ];
      for (const source of bad) expect(CurriculumProposalContentSchema.safeParse({ ...content, source }).success).toBe(false);
    });

    it("campo sem apoio só com os tipos conhecidos", () => {
      const unsupported = [{ field: "workload", groupIndex: null, itemIndex: null }];
      expect(CurriculumProposalContentSchema.safeParse({ ...content, grounding: { unsupported } }).success).toBe(false);
    });
  });

  describe("ids de item da proposta", () => {
    it("aceita os três campos e group:<i>", () => {
      for (const id of ["title", "syllabusText", "competencyText", "group:0", "group:199"]) {
        expect(CurriculumItemIdSchema.safeParse(id).success, id).toBe(true);
      }
      for (const id of ["groups", "group:", "group:-1", "group:01", "group:200", "item:0", "workload"]) {
        expect(CurriculumItemIdSchema.safeParse(id).success, id).toBe(false);
      }
    });
  });

  describe("007/US4-6 o pedido e a aplicação não aceitam campos de controle", () => {
    const controls = ["workspaceId", "teacherId", "agentKey", "toolKeys", "riskLevel"];

    it("pedido de análise: vazio ou com discardPendingProposal", () => {
      expect(RequestCurriculumAnalysisRequestSchema.safeParse({}).success).toBe(true);
      expect(RequestCurriculumAnalysisRequestSchema.safeParse({ discardPendingProposal: true }).success).toBe(true);
    });

    it.each(controls)("pedido de análise recusa %s", (field) => {
      expect(RequestCurriculumAnalysisRequestSchema.safeParse({ [field]: ID }).success).toBe(false);
    });

    it.each(controls)("aplicação recusa %s", (field) => {
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: ["title"], replaceDraft: false, [field]: ID }).success).toBe(false);
    });
  });

  describe("aplicação da proposta", () => {
    it("1 a 203 ids válidos e replaceDraft obrigatório", () => {
      const all = ["title", "syllabusText", "competencyText", ...Array.from({ length: 200 }, (_, i) => `group:${i}`)];
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: all, replaceDraft: true }).success).toBe(true);
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: [], replaceDraft: false }).success).toBe(false);
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: ["title"] }).success).toBe(false);
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: ["group:x"], replaceDraft: false }).success).toBe(false);
    });

    it("ids aceitos repetidos são recusados", () => {
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: ["title", "title"], replaceDraft: false }).success).toBe(false);
      expect(ApplyCurriculumProposalRequestSchema.safeParse({ acceptedItemIds: ["group:1", "group:1"], replaceDraft: false }).success).toBe(false);
    });
  });

  describe("situação da IA no documento", () => {
    const status = { availability: "AVAILABLE", activeExecution: null, lastExecution: null, lastOutcome: null, pendingProposalId: null };

    it("aceita as razões de indisponibilidade e o último resultado", () => {
      for (const availability of ["AVAILABLE", "DOCUMENT_NOT_READY", "DOCUMENT_WITHOUT_TEXT", "AGENT_DISABLED", "MODEL_UNAVAILABLE", "PAUSED"]) {
        expect(CurriculumAiStatusSchema.safeParse({ ...status, availability }).success, availability).toBe(true);
      }
      expect(CurriculumAiStatusSchema.safeParse({ ...status, lastOutcome: "NOTHING_FOUND", pendingProposalId: ID }).success).toBe(true);
      expect(CurriculumAiStatusSchema.safeParse({ ...status, availability: "NOT_CONFIGURED" }).success).toBe(false);
      expect(CurriculumAiStatusSchema.safeParse({ ...status, lastOutcome: "FAILED" }).success).toBe(false);
    });
  });
});
