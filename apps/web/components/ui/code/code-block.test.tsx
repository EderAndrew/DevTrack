import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { CodeBlock } from "./code-block";

// 014 contracts/web-ui.md, research L4: read-only code as React spans. The text of the code
// element is always the stored code, character by character.

const JAVA = 'String nome = "Ana"; // aluno\nint n = 42;';

const codeOf = (container: Element) => container.querySelector("pre code") as HTMLElement;
const segments = (container: Element) =>
  [...codeOf(container).querySelectorAll<HTMLElement>("span[class]")].map((span) => [span.textContent, span.className]);

async function colored(container: Element) {
  await waitFor(() => {
    if (!codeOf(container).querySelector(".text-syntax-keyword, .text-syntax-type")) throw new Error("ainda sem cores");
  });
}

describe("014/US2 CodeBlock só leitura", () => {
  afterEach(() => vi.restoreAllMocks());

  it("colore pela gramática depois do carregamento, com o texto puro antes", async () => {
    const { container } = render(<CodeBlock code={JAVA} highlight="java" label="Solução de referência" />);
    // Before the grammar arrives: the plain text, already readable.
    expect(codeOf(container).textContent).toBe(JAVA);
    await colored(container);
    expect(segments(container)).toEqual(
      expect.arrayContaining([
        ["String", "text-syntax-type"],
        ['"Ana"', "text-syntax-string"],
        ["// aluno", "text-syntax-comment"],
        ["int", "text-syntax-type"],
        ["42", "text-syntax-number"],
      ]),
    );
    expect(codeOf(container).textContent).toBe(JAVA);
    expect(screen.getByRole("group", { name: "Solução de referência" })).toBeTruthy();
  });

  it("sem gramática (highlight null ou desconhecido) mostra o texto puro", async () => {
    const { container, rerender } = render(<CodeBlock code={JAVA} highlight={null} label="Código" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(codeOf(container).querySelector("span[class]")).toBeNull();
    expect(codeOf(container).textContent).toBe(JAVA);
    rerender(<CodeBlock code={JAVA} highlight="kotlin" label="Código" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(codeOf(container).querySelector("span[class]")).toBeNull();
  });

  it("014/US2-4 o texto copiado é o código exato, sem números de linha", async () => {
    const user = userEvent.setup();
    const code = "class A {\n\tint x;   \n}\n";
    const { container } = render(<CodeBlock code={code} highlight="java" label="Resposta do aluno" />);
    await colored(container);
    expect(codeOf(container).textContent).toBe(code);
    const gutter = container.querySelector('[data-slot="code-block-lines"]') as HTMLElement;
    expect(gutter.getAttribute("aria-hidden")).toBe("true");
    expect(gutter.className).toContain("select-none");
    // The trailing new line opens no extra line: three numbers for three visible lines.
    expect(gutter.textContent).toBe("123");
    expect(codeOf(container).contains(gutter)).toBe(false);
    // Read-only: Tab moves the focus, nothing is editable.
    expect(container.querySelector("[contenteditable], textarea")).toBeNull();
    render(<button type="button">depois</button>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
  });

  it.each([
    ["html", '<script>alert(1)</script><img src=x onerror="alert(2)">'],
    ["java", 'String s = "<script>alert(1)</script>"; // <b>negrito</b>'],
  ])("014/FR-009 código com HTML em %s vira texto", async (highlight, code) => {
    const { container } = render(<CodeBlock code={code} highlight={highlight} label="Código" />);
    await colored(container).catch(() => undefined);
    expect(container.querySelector("script, img, b")).toBeNull();
    expect(codeOf(container).textContent).toBe(code);
  });

  it("\\r\\n guardado aparece sem alteração", async () => {
    const code = "int a = 1;\r\nint b = 2;\r\n";
    const { container } = render(<CodeBlock code={code} highlight="java" label="Código" />);
    await colored(container);
    expect(codeOf(container).textContent).toBe(code);
    expect(container.querySelector('[data-slot="code-block-lines"]')!.textContent).toBe("12");
  });

  it("um código novo nunca mostra as cores do anterior", async () => {
    const { container, rerender } = render(<CodeBlock code="int a;" highlight="java" label="Código" />);
    await colored(container);
    rerender(<CodeBlock code="String b;" highlight="java" label="Código" />);
    expect(codeOf(container).textContent).toBe("String b;");
    await waitFor(() => expect(segments(container)).toContainEqual(["String", "text-syntax-type"]));
  });

  it("região rolável com nome e tabIndex=0 só quando transborda", async () => {
    const { container, unmount } = render(<CodeBlock code="int a;" highlight="java" label="Solução esperada" />);
    const scroller = () => container.querySelector('[data-slot="code-block-scroll"]') as HTMLElement;
    expect(scroller().hasAttribute("tabindex")).toBe(false);
    expect(screen.queryByRole("region")).toBeNull();
    await expectNoA11yViolations(container);
    unmount();

    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
    const long = render(<CodeBlock code={"int a;".repeat(80)} highlight="java" label="Solução esperada" />);
    const region = await screen.findByRole("region", { name: "Solução esperada" });
    expect(region.getAttribute("tabindex")).toBe("0");
    await colored(long.container);
    await expectNoA11yViolations(long.container);
  });
});
