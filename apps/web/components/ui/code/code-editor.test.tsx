import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeMirrorContent, codeMirrorText, syntaxSegments, typeCode } from "../../../test/code-editor";
import { CodeEditor, type CodeEditorHandle } from "./code-editor";

// 014 contracts/web-ui.md, research L2, L6, L7: the colored editor. Every case compares what
// `onChange` reports with what was typed, character by character.

const HINT = "Tab indenta o código; Esc e depois Tab sai do editor.";

function Host({
  initial = "",
  highlight = "java",
  onChange,
  disabled,
  error,
}: {
  initial?: string;
  highlight?: string | null;
  onChange?: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <button type="button">antes</button>
      <span id="rotulo">Sua resposta (Java)</span>
      <CodeEditor
        id="ed"
        aria-labelledby="rotulo"
        aria-describedby={error ? "ed-erro" : undefined}
        aria-invalid={error ? true : undefined}
        highlight={highlight}
        value={value}
        disabled={disabled}
        onChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
      />
      {error ? <p id="ed-erro">{error}</p> : null}
      <button type="button">depois</button>
    </>
  );
}

const lastCall = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

describe("014/US1 CodeEditor colorido", () => {
  it("014/US1-1 mostra o código inicial com números de linha e o rótulo com a linguagem", async () => {
    const { container } = render(<Host initial={"class Main {\n}"} />);
    const content = await codeMirrorContent(container);
    expect(screen.getByRole("textbox", { name: "Sua resposta (Java)" })).toBe(content);
    expect(codeMirrorText(content)).toBe("class Main {\n}");
    const numbers = [...container.querySelectorAll(".cm-lineNumbers .cm-gutterElement")].map((el) => el.textContent);
    expect(numbers).toEqual(expect.arrayContaining(["1", "2"]));
    expect(container.querySelector(".cm-gutters")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(HINT)).toBeTruthy();
    expect(content.getAttribute("aria-describedby")).toContain("ed-ajuda");
  });

  it("014/US1-2 digitar Java colore palavra-chave, texto e comentário e o onChange recebe o texto exato", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host onChange={onChange} />);
    const content = await codeMirrorContent(container);
    await user.click(content);
    const typed = 'String nome = "Ana"; // aluno';
    await typeCode(user, typed);
    expect(lastCall(onChange)).toBe(typed);
    expect(syntaxSegments(content)).toEqual(
      expect.arrayContaining([
        ["String", "text-syntax-type"],
        ['"Ana"', "text-syntax-string"],
        ["// aluno", "text-syntax-comment"],
      ]),
    );
    await user.keyboard("{Control>}a{/Control}");
    await typeCode(user, "for (int i = 0; i < 1; i++) {}");
    expect(syntaxSegments(content)).toEqual(expect.arrayContaining([["for", "text-syntax-keyword"], ["0", "text-syntax-number"]]));
  });

  it("014/US1-3 Tab insere dois espaços e o foco fica; Esc e Tab sai; Shift+Tab volta", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host onChange={onChange} />);
    const content = await codeMirrorContent(container);
    await user.click(content);
    await typeCode(user, "a");
    await user.keyboard("{Tab}");
    await typeCode(user, "b");
    expect(lastCall(onChange)).toBe("a  b");
    expect(document.activeElement).toBe(content);
    await user.keyboard("{Escape}");
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
    await user.click(content);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "antes" }));
    expect(lastCall(onChange)).toBe("a  b");
  });

  it("014/FR-007 Enter não indenta e aspas e parênteses não se fecham sozinhos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host onChange={onChange} />);
    const content = await codeMirrorContent(container);
    await user.click(content);
    await typeCode(user, "  if (x) {\nfoo(\"a");
    expect(lastCall(onChange)).toBe('  if (x) {\nfoo("a');
  });

  it("014/FR-007 valor guardado com \\r\\n: trocar e re-renderizar não emitem onChange nem movem o cursor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Crlf() {
      const [value, setValue] = useState("a\r\nb");
      const [, rerender] = useState(0);
      return (
        <>
          <span id="r">Código</span>
          <CodeEditor id="crlf" aria-labelledby="r" highlight="java" value={value} onChange={(next) => (onChange(next), setValue(next))} />
          <button type="button" onClick={() => rerender((n) => n + 1)}>
            renderizar
          </button>
        </>
      );
    }
    const { container } = render(<Crlf />);
    const textarea = screen.getByRole("textbox", { name: "Código" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(3, 3);
    const content = await codeMirrorContent(container);
    expect(document.activeElement).toBe(content);
    fireEvent.click(screen.getByRole("button", { name: "renderizar" }));
    expect(onChange).not.toHaveBeenCalled();
    content.focus();
    await typeCode(user, "X");
    expect(onChange.mock.calls).toEqual([["a\nbX"]]);
  });

  it("014/FR-014 a troca textarea → CodeMirror mantém valor, seleção e foco e não emite onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host initial="int total;" onChange={onChange} />);
    const textarea = screen.getByRole("textbox", { name: "Sua resposta (Java)" }) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.value).toBe("int total;");
    textarea.focus();
    textarea.setSelectionRange(4, 9);
    const content = await codeMirrorContent(container);
    expect(container.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(content);
    expect(onChange).not.toHaveBeenCalled();
    await typeCode(user, "soma");
    expect(lastCall(onChange)).toBe("int soma;");
  });

  it("014/FR-012 desfazer e refazer devolvem os textos anteriores; recortar e colar emitem o texto exato", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host onChange={onChange} />);
    const content = await codeMirrorContent(container);
    await user.click(content);
    await typeCode(user, "ab");
    await user.keyboard("{Control>}z{/Control}");
    expect(lastCall(onChange)).toBe("");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(lastCall(onChange)).toBe("ab");
    await user.paste('\t<script>alert("x")</script>  \nçã 😀');
    expect(lastCall(onChange)).toBe('ab\t<script>alert("x")</script>  \nçã 😀');
    expect(container.querySelector("script")).toBeNull();
    await user.keyboard("{Control>}a{/Control}");
    await user.cut();
    expect(lastCall(onChange)).toBe("");
  });

  it("014/FR-013 aria-labelledby, aria-describedby (dica e erro) e aria-invalid chegam ao conteúdo; foco pela ref", async () => {
    const handle = createRef<CodeEditorHandle>();
    function WithRef() {
      return (
        <>
          <span id="rot">Solução esperada</span>
          <CodeEditor id="sol" ref={handle} aria-labelledby="rot" aria-describedby="sol-erro" aria-invalid value="" onChange={() => undefined} highlight="python" />
          <p id="sol-erro">Informe a solução esperada.</p>
          <button type="button">depois</button>
        </>
      );
    }
    const { container } = render(<WithRef />);
    const content = await codeMirrorContent(container);
    expect(content.getAttribute("aria-labelledby")).toBe("rot");
    expect(content.getAttribute("aria-describedby")).toBe("sol-ajuda sol-erro");
    expect(content.getAttribute("aria-invalid")).toBe("true");
    expect(content.getAttribute("aria-multiline")).toBe("true");
    act(() => handle.current!.focus());
    expect(document.activeElement).toBe(content);
    await expectNoA11yViolations(container);
  });

  it("014/FR-010 desabilitado não edita, e o estado não é só cor (borda tracejada, aria-disabled)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host initial="class A {}" onChange={onChange} disabled />);
    const content = await codeMirrorContent(container);
    expect(content.getAttribute("contenteditable")).toBe("false");
    expect(content.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector('[data-slot="code-editor-host"]')?.className).toContain("[&_.cm-editor]:border-dashed");
    await user.click(content);
    await typeCode(user, "x");
    expect(onChange).not.toHaveBeenCalled();
    expect(codeMirrorText(content)).toBe("class A {}");
  });

  it("014/FR-010 dentro de <fieldset disabled> também não edita", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <fieldset disabled>
        <span id="rf">Código inicial</span>
        <CodeEditor id="fs" aria-labelledby="rf" highlight="java" value="int x;" onChange={onChange} />
      </fieldset>,
    );
    const content = await codeMirrorContent(container);
    expect(content.getAttribute("contenteditable")).toBe("false");
    expect(content.getAttribute("aria-disabled")).toBe("true");
    expect(content.getAttribute("aria-readonly")).toBe("true");
  });

  it("014/US1-5 sem gramática (highlight null) o editor funciona igual, sem cores", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Host highlight={null} onChange={onChange} />);
    const content = await codeMirrorContent(container);
    await user.click(content);
    await typeCode(user, 'String s = "x";');
    expect(lastCall(onChange)).toBe('String s = "x";');
    expect(syntaxSegments(content)).toEqual([]);
    await expectNoA11yViolations(container);
  });

  it("014/US3-2 a linguagem escolhida antes de o editor carregar ainda colore, e trocá-la não muda o texto", async () => {
    const onChange = vi.fn();
    const editor = (highlight: string | null) => (
      <CodeEditor id="ed" aria-label="Solução esperada" highlight={highlight} value={"class A {} // ok"} onChange={onChange} />
    );
    const { container, rerender } = render(editor(null));
    rerender(editor("java"));
    const content = await codeMirrorContent(container);
    await waitFor(() => expect(syntaxSegments(content)).toEqual(expect.arrayContaining([["class", "text-syntax-keyword"]])));
    rerender(editor("python"));
    await waitFor(() => expect(syntaxSegments(content)).not.toEqual(expect.arrayContaining([["// ok", "text-syntax-comment"]])));
    expect(codeMirrorText(content)).toBe("class A {} // ok");
    expect(onChange).not.toHaveBeenCalled();
  });
});
