import { type CurriculumExtractionOutputV2, CurriculumProposalContentSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { applyProposal, createCurriculumAiApp, pooOutput, requestAnalysis, scriptCurriculumRun, seedGoldenDocument, seedProcessedDocument } from "../helpers/curriculum-ai";
import { languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";

/**
 * 010/US7-6…US7-8, 010/FR-041: "Preencher com IA" (curriculum-agent v3) proposes the syllabus'
 * language, only from the catalog, flags it when the document doesn't name it, and the teacher's
 * acceptance writes it on the draft.
 */

/** The agent's answer for the golden document "Programação Orientada a Objetos com Java". */
const javaOutput = (languageKey: string | null): CurriculumExtractionOutputV2 => ({
  title: "Programação Orientada a Objetos com Java",
  syllabusText: "Fundamentos da programação orientada a objetos com a linguagem Java: classes, objetos, herança e interfaces.",
  competencyText: "Implementar programas orientados a objetos em Java aplicando encapsulamento e herança.",
  groups: [
    { title: "Fundamentos", items: [{ text: "Classes e objetos", sourceRef: null }, { text: "Encapsulamento", sourceRef: null }] },
    { title: "Reuso", items: [{ text: "Herança", sourceRef: null }, { text: "Interfaces", sourceRef: null }] },
  ],
  warnings: [],
  languageKey,
});

describe("010/US7 010/FR-041 o Preencher com IA propõe a linguagem da ementa", () => {
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

  /** Runs one analysis of `document` answering `output`; the proposal and its parsed content. */
  async function analyse(document: SyllabusDocument, output: CurriculumExtractionOutputV2) {
    scriptCurriculumRun(t.provider, document.id, output);
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    await drain(t);
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id }, include: { proposal: true } });
    expect(execution.status).toBe("COMPLETED");
    return { proposal: execution.proposal!, content: CurriculumProposalContentSchema.parse(execution.proposal!.payload) };
  }

  it("010/US7-6 documento que declara Java → proposta com a linguagem Java, apoiada, como item aceitável", async () => {
    const { document } = await seedGoldenDocument(t, teacher.id, "linguagem-java");
    const { proposal, content } = await analyse(document, javaOutput("java"));

    expect(content.language).toEqual({ key: "java", name: "Java" });
    expect(content.grounding.unsupported).toEqual([]);
    expect(proposal.itemIds).toEqual(["title", "syllabusText", "competencyText", "language", "group:0", "group:1"]);
    // The read tool gave the model the catalog: its key and name are the only values it can use.
    const toolResult = JSON.stringify(t.provider.requests.at(-1));
    for (const name of ["TypeScript", "HTML & CSS", "Python"]) expect(toolResult).toContain(name);
  });

  it.each([
    ["sem linguagem", null],
    ["fora do catálogo (Kotlin)", "kotlin"],
    ["inventada", "java-script-9"],
  ])("010/US7-7 linguagem %s na saída → a proposta vem sem linguagem, nunca um valor novo", async (_, languageKey) => {
    const { document } = await seedGoldenDocument(t, teacher.id, "linguagem-fora-do-catalogo");
    const { proposal, content } = await analyse(document, { ...javaOutput(null), languageKey });
    expect(content.language).toBeNull();
    expect(proposal.itemIds).not.toContain("language");
  });

  it("010/US7-8 linguagem do catálogo que o documento não menciona → sinalizada UNSUPPORTED_CONTENT", async () => {
    const { document } = await seedProcessedDocument(t, teacher.id, "poo.pdf");
    const { content } = await analyse(document, pooOutput("python"));
    expect(content.language).toEqual({ key: "python", name: "Python" });
    expect(content.grounding.unsupported).toContainEqual({ field: "language", groupIndex: null, itemIndex: null });
  });

  describe("010/US7-6 aplicar a proposta", () => {
    it("aceitar a linguagem grava language_id no rascunho AI_ASSISTED; a auditoria conta o campo", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "linguagem-java");
      const { proposal } = await analyse(document, javaOutput("java"));

      const res = await applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ["title", "language", "group:0"], replaceDraft: false });
      expect(res.status).toBe(200);
      expect(res.body.revision).toMatchObject({ status: "DRAFT", source: "AI_ASSISTED", language: { id: await languageId(t, "java"), name: "Java" } });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.proposal_applied" } });
      expect(event.metadata).toMatchObject({ acceptedFields: 2, acceptedGroups: 1 });
    });

    it("sem aceitar a linguagem, o rascunho fica sem linguagem (o professor escolhe na tela da ementa)", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "linguagem-java");
      const { proposal } = await analyse(document, javaOutput("java"));
      const res = await applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ["title", "group:0"], replaceDraft: false });
      expect(res.status).toBe(200);
      expect(res.body.revision.language).toBeNull();
    });

    it("linguagem desativada no catálogo depois da proposta → 422 CURRICULUM_PROPOSAL_INVALID, nada gravado", async () => {
      const { document } = await seedGoldenDocument(t, teacher.id, "linguagem-java");
      const { proposal } = await analyse(document, javaOutput("java"));
      const java = await languageId(t, "java");
      await t.prisma.programmingLanguage.update({ where: { id: java }, data: { active: false } });
      try {
        const res = await applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ["title", "language"], replaceDraft: false });
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: "CURRICULUM_PROPOSAL_INVALID" });
        expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id } })).toBe(0);
        // Without the language, the rest still applies.
        expect((await applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ["title"], replaceDraft: false })).status).toBe(200);
      } finally {
        await t.prisma.programmingLanguage.update({ where: { id: java }, data: { active: true } });
      }
    });
  });
});
