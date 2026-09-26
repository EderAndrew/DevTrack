import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "../../../../test/helpers/env";
import { MAX_BLOCK_TEXT, type NormalizedBlock, normalizeDocument, normalizeLines, READER_VERSION } from "./normalize";
import type { SourceLine } from "./source-line";
import { UnreadableSyllabusError } from "./syllabus-extractor";

const fixture = (name: string) => readFileSync(resolve(API_ROOT, "test/fixtures/syllabus", name));

const GROUPS = ["Fundamentos de POO", "Padrões de Design em POO", "POO em Ambientes Reais", "Práticas de Implementação"];
const COMPETENCY =
  "Capacitar os alunos a projetar e implementar soluções de software com os princípios da programação orientada a " +
  "objetos, aplicando boas práticas de design, padrões de projeto e testes unitários na construção de sistemas " +
  "robustos e extensíveis.";

const line = (text: string, patch: Partial<SourceLine> = {}): SourceLine => ({
  text,
  emphasis: false,
  list: null,
  wraps: true,
  ...patch,
});

const byKind = (blocks: NormalizedBlock[], kind: NormalizedBlock["kind"]) => blocks.filter((b) => b.kind === kind);

describe("007/FR-009 leitura normalizada (research C11)", () => {
  it("READER_VERSION é 1", () => {
    expect(READER_VERSION).toBe(1);
  });

  describe.each([
    ["poo.pdf", "PDF", /^p1\.\d+$/],
    ["poo.docx", "DOCX", /^par\d+$/],
  ] as const)("%s", (name, mediaType, refFormat) => {
    let blocks: NormalizedBlock[];

    it("lê os blocos em ordem, com ref no formato do tipo e texto de 1 a 4000 caracteres", async () => {
      blocks = await normalizeDocument(fixture(name), mediaType);
      expect(blocks.length).toBeGreaterThan(20);
      for (const block of blocks) {
        expect(block.ref).toMatch(refFormat);
        expect(block.text.length).toBeGreaterThan(0);
        expect(block.text.length).toBeLessThanOrEqual(MAX_BLOCK_TEXT);
      }
      const positions = blocks.map((b) => Number(b.ref.replace(/^p1\.|^par/, "")));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it("os 4 grupos e os 16 itens vêm na ordem do documento, com o tipo certo", () => {
      const groups = byKind(blocks, "group");
      expect(groups.map((b) => b.text.replace(/^\d\.\s+/, ""))).toEqual(GROUPS);
      expect(byKind(blocks, "item")).toHaveLength(16);
      const first = blocks.findIndex((b) => b.kind === "group");
      expect(blocks.slice(first + 1, first + 5).map((b) => b.kind)).toEqual(["item", "item", "item", "item"]);
      expect(blocks[first + 1]!.text).toMatch(/Conceitos de classes, objetos e métodos$/);
    });

    it("títulos de seção são heading, e o parágrafo da competência é um bloco só", () => {
      expect(byKind(blocks, "heading").map((b) => b.text)).toEqual(
        expect.arrayContaining(["Ementa", "Competência", "Objetos de Aprendizagem"]),
      );
      const competency = blocks[blocks.findIndex((b) => b.text === "Competência") + 1]!;
      expect(competency).toMatchObject({ kind: "text", text: COMPETENCY });
    });

    it("a mesma entrada dá sempre os mesmos blocos", async () => {
      expect(await normalizeDocument(fixture(name), mediaType)).toEqual(blocks);
    });
  });

  it("PDF: o bloco juntado guarda a ref da primeira linha", async () => {
    const blocks = await normalizeDocument(fixture("poo.pdf"), "PDF");
    const heading = blocks.findIndex((b) => b.text === "Competência");
    const [title, competency] = [blocks[heading]!, blocks[heading + 1]!];
    expect(Number(competency.ref.split(".")[1])).toBe(Number(title.ref.split(".")[1]) + 1);
  });

  it("dez-paginas.pdf: refs de todas as páginas", async () => {
    const blocks = await normalizeDocument(fixture("dez-paginas.pdf"), "PDF");
    expect(new Set(blocks.map((b) => b.ref.split(".")[0]))).toEqual(new Set(Array.from({ length: 10 }, (_, i) => `p${i + 1}`)));
  });

  it("arquivo ilegível → UnreadableSyllabusError", async () => {
    await expect(normalizeDocument(fixture("corrompido.pdf"), "PDF")).rejects.toBeInstanceOf(UnreadableSyllabusError);
  });

  describe("regras sobre linhas em memória", () => {
    it("linha sem marcador continua o bloco de cima (PDF), mas nunca um heading", () => {
      const blocks = normalizeLines([
        line("Ementa", { emphasis: true, ref: "p1.1" }),
        line("Exploração dos princípios", { ref: "p1.2" }),
        line("da orientação a objetos.", { ref: "p1.3" }),
        line("• Encapsulamento e", { ref: "p1.4" }),
        line("herança.", { ref: "p1.5" }),
      ]);
      expect(blocks).toEqual([
        { ref: "p1.1", kind: "heading", text: "Ementa" },
        { ref: "p1.2", kind: "text", text: "Exploração dos princípios da orientação a objetos." },
        { ref: "p1.4", kind: "item", text: "• Encapsulamento e herança." },
      ]);
    });

    it("parágrafo do DOCX nunca continua o de cima; o tipo vem da numeração", () => {
      const blocks = normalizeLines([
        line("Fundamentos", { list: "group", wraps: false, ref: "par1" }),
        line("Classes", { list: "item", wraps: false, ref: "par2" }),
        line("Texto solto", { wraps: false, ref: "par3" }),
        line("Mais texto", { wraps: false, ref: "par4" }),
      ]);
      expect(blocks.map((b) => [b.ref, b.kind])).toEqual([
        ["par1", "group"],
        ["par2", "item"],
        ["par3", "text"],
        ["par4", "text"],
      ]);
    });

    it("marcador digitado: grupo e item; rótulo de seção sem negrito é heading", () => {
      const blocks = normalizeLines([line("Competências:"), line("1. Fundamentos"), line("a) Classes"), line("- Objetos")]);
      expect(blocks.map((b) => b.kind)).toEqual(["heading", "group", "item", "item"]);
    });

    it("não passa de 4000 caracteres: o parágrafo longo é dividido num espaço, com a mesma ref", () => {
      const word = "palavra ";
      const long = word.repeat(1200).trim();
      const blocks = normalizeLines([line(long, { wraps: false, ref: "par7" })]);
      expect(blocks.length).toBe(3);
      for (const block of blocks) {
        expect(block.ref).toBe("par7");
        expect(block.text.length).toBeLessThanOrEqual(MAX_BLOCK_TEXT);
      }
      expect(blocks.map((b) => b.text).join(" ")).toBe(long);

      const joined = normalizeLines([line("a".repeat(3990), { ref: "p1.1" }), line("b".repeat(20), { ref: "p1.2" })]);
      expect(joined.map((b) => b.ref)).toEqual(["p1.1", "p1.2"]);
    });

    it("linhas vazias são ignoradas e espaços, colapsados", () => {
      expect(normalizeLines([line("  "), line("  Ementa   do  curso ", { emphasis: true, ref: "p1.2" })])).toEqual([
        { ref: "p1.2", kind: "heading", text: "Ementa do curso" },
      ]);
    });
  });
});
