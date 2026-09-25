// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/features/design-system/registry";
import { WEB_ROOT } from "./scan";

// 005 US4-3 (FR-032; research V17, V19): the documentation covers every token and every entry
// of the catalog, so the rules outlive this feature.

const doc = (file: string) => readFileSync(join(WEB_ROOT, "design-system", file), "utf8");

/** Body of the `## title` section (up to the next `## `), or null when the heading is missing. */
function section(markdown: string, title: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/** Custom properties declared in tokens.css, without Tailwind's `--color-*` bindings and resets. */
function declaredTokens(): string[] {
  const css = readFileSync(join(WEB_ROOT, "design-system/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name!);
  return [...new Set(names)].filter(
    (name) => !name.startsWith("--color-") && !name.endsWith("-*") && !/--(line-height|font-weight)$/.test(name),
  );
}

const SUBSECTIONS = ["Variantes", "Estados", "Quando usar", "Quando não usar", "Exemplo", "Acessibilidade"];

describe("005/US4-3 005/FR-032 documentação do Design System", () => {
  it("README.md tem as seções de princípios, cores, regras contra UI genérica, camadas e uso, com conteúdo", () => {
    const readme = doc("README.md");
    for (const title of [
      "Princípios",
      "Cores e a regra 80/15/5",
      "Regras contra UI genérica",
      "Arquitetura em camadas",
      "Como usar",
    ]) {
      expect(section(readme, title)?.trim(), title).toBeTruthy();
    }
  });

  it("tokens.md cita cada token de tokens.css", () => {
    const tokens = doc("tokens.md");
    const names = declaredTokens();
    expect(names.length).toBeGreaterThan(50);
    expect(names.filter((name) => !tokens.includes(`\`${name}\``))).toEqual([]);
  });

  it.each(REGISTRY.map((entry) => [entry.name, entry] as const))(
    "%s tem seção em components.md ou layouts.md com os subtítulos",
    (name, entry) => {
      const body = section(doc(entry.group === "layouts" ? "layouts.md" : "components.md"), name);
      expect(body, `seção "## ${name}"`).not.toBeNull();
      const missing = SUBSECTIONS.filter((title) => !body!.includes(`### ${title}\n`));
      expect(missing, name).toEqual([]);
    },
  );

  it("components.md e layouts.md não documentam o que não está no catálogo", () => {
    const documented = (file: string) => [...doc(file).matchAll(/^## (.+)$/gm)].map(([, title]) => title!);
    const names = REGISTRY.map((entry) => entry.name);
    expect([...documented("components.md"), ...documented("layouts.md")].filter((t) => !names.includes(t))).toEqual([]);
  });
});

// 005 US6 (FR-025 – FR-030; contracts/exam-mode.md; research V15): the Exam Mode contract is
// complete, without an open visual decision, and cites only existing tokens, components and icons.

const EXAM_COMPONENTS = [
  "ExamHeader",
  "ExamProgress",
  "QuestionNavigator",
  "QuestionHeader",
  "QuestionStatus",
  "ReviewFlag",
  "QuestionStatement",
  "AnswerArea",
  "MultipleChoiceAnswer",
  "EssayAnswer",
  "CodeAnswer",
  "CodeEditor",
  "SaveStatus",
  "ExamTimer",
  "AttemptStatus",
  "ExamFooter",
  "ExamAlert",
  "FocusViolationWarning",
];

/** Rows of the first Markdown table whose header has every given column, keyed by header. */
function table(markdown: string, columns: string[]): Record<string, string>[] {
  const lines = markdown.split("\n");
  const cells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  const start = lines.findIndex((line) => line.startsWith("|") && columns.every((c) => cells(line).includes(c)));
  if (start === -1) return [];
  const header = cells(lines[start]!);
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const values = cells(line);
    rows.push(Object.fromEntries(header.map((name, i) => [name, values[i] ?? ""])));
  }
  return rows;
}

const exam = () => doc("exam-mode.md");

describe("005/US6 contrato visual do modo avaliação (design-system/exam-mode.md)", () => {
  it("é a cópia publicada do contrato da spec", () => {
    const spec = readFileSync(join(WEB_ROOT, "../../specs/005-design-system/contracts/exam-mode.md"), "utf8");
    expect(exam()).toBe(spec);
  });

  it("README.md aponta para o contrato", () => {
    expect(doc("README.md")).toContain("(./exam-mode.md)");
  });

  it("005/US6-1 seção Layout com as regiões e a ordem de prioridade", () => {
    const layout = section(exam(), "Layout");
    expect(layout).not.toBeNull();
    for (const region of [
      "ExamHeader",
      "ExamProgress",
      "QuestionNavigator",
      "QuestionStatement",
      "AnswerArea",
      "ExamFooter",
    ]) {
      expect(layout, region).toContain(region);
    }
    const priority = (layout!.match(/Prioridade visual[\s\S]*?\n\n/)?.[0] ?? "").replace(/\s+/g, " ");
    const steps = [
      "número e estado",
      "enunciado",
      "material complementar",
      "área de resposta",
      "salvamento",
      "navegação",
    ];
    const positions = steps.map((step) => priority.indexOf(step));
    expect(
      positions.every((position) => position >= 0),
      priority,
    ).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(layout).toMatch(/<nav aria-label="Questões">/);
  });

  it("005/US6-2 005/FR-027 tabela dos seis estados de questão, nenhum só por cor", () => {
    const columns = ["Estado", "Cor", "Forma", "Ícone (Lucide)", "Texto visível", "Anúncio"];
    const rows = table(exam(), columns);
    expect(rows.map((row) => row.Estado)).toEqual([
      "atual",
      "não respondida",
      "respondida",
      "marcada para revisão",
      "bloqueada",
      "invalidada",
    ]);
    for (const row of rows) {
      for (const column of columns) expect(row[column], `${row.Estado} / ${column}`).toBeTruthy();
      expect(row.Anúncio, row.Estado).toMatch(/^"Questão \d+, /);
    }
  });

  it("005/US6-3 005/FR-028 SaveStatus com salvando, salvo e erro ao salvar", () => {
    const rows = table(section(exam(), "Componentes") ?? "", ["Estado", "Ícone", "Texto", "Cor", "Anúncio"]);
    expect(rows.map((row) => row.Estado)).toEqual(["salvando", "salvo", "erro ao salvar"]);
    const error = rows.find((row) => row.Estado === "erro ao salvar")!;
    expect(error.Anúncio).toContain('role="alert"');
    expect(rows.find((row) => row.Estado === "salvo")?.Anúncio).toContain('role="status"');
  });

  it("005/US6-4 005/FR-029 avisos com o que aconteceu, o registro e o que fazer, sem ameaça", () => {
    const rows = table(exam(), ["Situação", "Variante", "Título", "Registro", "O que fazer"]);
    const situations = [
      "perda de foco",
      "tentativa de sair",
      "desconexão",
      "falha de sincronização",
      "tempo acabando",
      "encerramento",
    ];
    expect(rows).toHaveLength(situations.length);
    situations.forEach((situation, i) => expect(rows[i]?.Situação?.startsWith(situation), situation).toBe(true));
    for (const row of rows) {
      for (const column of ["Título", "Registro", "O que fazer"]) expect(row[column], row.Situação).toBeTruthy();
      expect(`${row.Título} ${row.Registro} ${row["O que fazer"]}`).not.toMatch(/viola|fraude|puni|proibid/i);
    }
  });

  it("005/US6-5 CodeAnswer separa enunciado, editor, saída, erros e resultado; monoespaçada só no código", () => {
    const code = exam()
      .split("\n")
      .find((line) => line.startsWith("- `CodeAnswer`:"));
    const block = exam().slice(exam().indexOf(code!), exam().indexOf("- `CodeEditor`:"));
    for (const region of ["enunciado", "editor", "saída", "erros", "resultado"])
      expect(block, region).toContain(region);
    expect(block).toMatch(/fonte monoespaçada só\s+existe dentro de editor, saída e erros/);
  });

  it("005/US6-6 005/FR-030 atualizações frequentes isoladas, sem mover foco nem rolagem", () => {
    const frequent = section(exam(), "Atualizações frequentes (FR-030)");
    expect(frequent).not.toBeNull();
    for (const name of ["ExamTimer", "SaveStatus", "ExamProgress", "CodeEditor", "AttemptStatus"]) {
      expect(frequent, name).toContain(name);
    }
    expect(frequent).toMatch(/não move o foco/);
    expect(frequent).toMatch(/não altera a rolagem/);
  });

  it("005/FR-026 005/SC-007 uma seção por componente de avaliação", () => {
    const text = exam();
    const documented = (name: string) =>
      new RegExp(`^### .*\\b${name}\\b`, "m").test(text) || text.includes(`- \`${name}\`:`);
    expect(EXAM_COMPONENTS.filter((name) => !documented(name))).toEqual([]);
  });

  it("005/SC-007 só cita tokens de tokens.css, componentes do catálogo e ícones do lucide-react", async () => {
    const text = exam();
    const tokens = declaredTokens();
    const cited = [...new Set([...text.matchAll(/`(--[\w*-]+)`/g)].map(([, token]) => token!))];
    const unknownTokens = cited.filter((token) =>
      token.endsWith("*") ? !tokens.some((name) => name.startsWith(token.slice(0, -1))) : !tokens.includes(token),
    );
    expect(unknownTokens).toEqual([]);

    const lucide: Record<string, unknown> = await import("lucide-react");
    const known = new Set([...REGISTRY.map((entry) => entry.name), ...EXAM_COMPONENTS]);
    const names = [...new Set([...text.matchAll(/`([A-Z][A-Za-z]+)`/g)].map(([, name]) => name!))];
    expect(names.filter((name) => !known.has(name) && !(name in lucide))).toEqual([]);
    for (const icon of ["Check", "Flag", "Lock", "Ban", "LoaderCircle", "CircleCheck", "CircleAlert", "Timer"]) {
      expect(icon in lucide, icon).toBe(true);
    }
  });
});
