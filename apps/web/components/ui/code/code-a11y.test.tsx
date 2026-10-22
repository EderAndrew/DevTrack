import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { codeMirrorContent, codeMirrorText } from "../../../test/code-editor";
import { CodeAnswer } from "../assessment/answers";
import { CodeBlock } from "./code-block";
import { EDITOR_THEME } from "./editor-theme";
import { SYNTAX_CLASSES } from "./highlighter";

// 014/US4: the code colors come from the design system, in both themes and in high contrast, and
// nothing depends on the color alone (the text read and copied is the code itself).

const WEB_ROOT = join(__dirname, "../../..");
const TOKENS_CSS = readFileSync(join(WEB_ROOT, "design-system/tokens.css"), "utf8");
const CATEGORIES = Object.keys(SYNTAX_CLASSES) as (keyof typeof SYNTAX_CLASSES)[];

/** One line of Java with every category: keyword, type, number, operator, string, function, punctuation, comment. */
const JAVA = 'class A { int f() { return 1 + "x".length(); } } // c';

/** The body of the `@media (forced-colors: active)` block of tokens.css. */
function forcedColorsBlock(): string {
  const start = TOKENS_CSS.indexOf("@media (forced-colors: active)");
  expect(start, "tokens.css sem bloco forced-colors").toBeGreaterThan(-1);
  let depth = 0;
  for (let i = TOKENS_CSS.indexOf("{", start); i < TOKENS_CSS.length; i += 1) {
    if (TOKENS_CSS[i] === "{") depth += 1;
    if (TOKENS_CSS[i] === "}" && --depth === 0) return TOKENS_CSS.slice(start, i + 1);
  }
  throw new Error("bloco forced-colors sem fim");
}

async function coloredBlock(code: string, highlight: string | null, label = "Solução de referência") {
  const view = render(<CodeBlock code={code} highlight={highlight} label={label} />);
  if (highlight) await waitFor(() => expect(view.container.querySelector("code span")).toBeTruthy());
  return view;
}

describe("014/US4 cores do código acessíveis em qualquer tema", () => {
  it("014/US4-1 cada categoria usa a classe do seu token, definido no tema do sistema", async () => {
    const { container } = await coloredBlock(JAVA, "java");
    const used = new Set([...container.querySelectorAll("code span")].map((span) => span.className));
    for (const category of CATEGORIES) {
      expect(used, `categoria ${category}`).toContain(SYNTAX_CLASSES[category]);
      // One dark theme (005 FR-013, amended 2026-10-22): one definition in :root.
      const definitions = TOKENS_CSS.match(new RegExp(`--syntax-${category}:\\s*#`, "g")) ?? [];
      expect(definitions.length, `--syntax-${category} no tema`).toBe(1);
      expect(TOKENS_CSS).toMatch(new RegExp(`--color-syntax-${category}:\\s*var\\(--syntax-${category}\\)`));
    }
    // The classes are the only color: no inline style on a segment.
    expect(container.querySelector("code span[style]")).toBeNull();
  });

  it("014/US4-2 o leitor de tela lê o texto das linhas, sem nomes de cor nem marcação, com a linguagem no rótulo", async () => {
    const { container } = render(
      <CodeAnswer id="resposta" language="Java" highlight="java" value={JAVA} onChange={() => undefined} publicTestCases={[]} />,
    );
    const content = await codeMirrorContent(container);
    await waitFor(() => expect(content.querySelector("span[class]")).toBeTruthy());
    expect(screen.getByRole("textbox", { name: "Sua resposta (Java)" })).toBe(content);
    expect(codeMirrorText(content)).toBe(JAVA);
    for (const span of content.querySelectorAll("span")) {
      expect(span.getAttribute("aria-label")).toBeNull();
      expect(span.getAttribute("title")).toBeNull();
      expect(span.getAttribute("role")).toBeNull();
    }
    const read = [...content.attributes].filter((attribute) => attribute.name.startsWith("aria-")).map((a) => a.value).join(" ");
    expect(read).not.toMatch(/syntax|keyword|cor|color/i);

    const block = await coloredBlock(JAVA, "java", "Solução de referência (Java)");
    const group = screen.getByRole("group", { name: "Solução de referência (Java)" });
    expect(group.querySelector("code")!.textContent).toBe(JAVA);
    for (const span of block.container.querySelectorAll("code span")) {
      expect(span.getAttribute("aria-label")).toBeNull();
      expect(span.getAttribute("title")).toBeNull();
    }
  });

  it("014/US4-3 em alto contraste as classes de sintaxe e o contorno de foco usam cores do sistema", () => {
    const block = forcedColorsBlock();
    for (const category of CATEGORIES) expect(block).toContain(`.${SYNTAX_CLASSES[category]}`);
    expect(block).toMatch(/color:\s*CanvasText/);
    // The focus outline of the editor and of the scrollable CodeBlock.
    expect(block).toMatch(/\.cm-editor\.cm-focused[^{]*\{[^}]*outline-color:\s*Highlight/);
    expect(block).toMatch(/\[data-slot="code-block-scroll"\]:focus-visible[^{]*\{[^}]*outline-color:\s*Highlight/);
    // Nothing removes the outline.
    expect(JSON.stringify(EDITOR_THEME)).not.toMatch(/outline"?:\s*"?none/);
    expect(EDITOR_THEME["&.cm-focused"].outline).toContain("solid");
  });

  it("014/FR-018 sem as classes de cor o código é o mesmo texto", async () => {
    const code = "if (a < b && c > d) {\n\t// <b>não é HTML</b>\n}";
    const colored = await coloredBlock(code, "java");
    const plain = render(<CodeBlock code={code} highlight={null} label="Sem gramática" />);
    const strip = (element: Element) => {
      const copy = element.cloneNode(true) as Element;
      for (const span of copy.querySelectorAll("[class]")) span.removeAttribute("class");
      return copy.textContent;
    };
    expect(strip(colored.container.querySelector("code")!)).toBe(code);
    expect(plain.container.querySelector("code")!.textContent).toBe(code);
    expect(plain.container.querySelector("code span")).toBeNull();
  });
});
