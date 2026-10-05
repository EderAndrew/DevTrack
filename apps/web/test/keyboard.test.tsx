import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CodeEditor } from "@/components/ui/code/code-editor";
import { codeMirrorContent } from "./code-editor";
import { expectFieldErrorLinked, expectTabOrder, tabSequence } from "./keyboard";

function Example() {
  return (
    <form>
      <label htmlFor="a">A</label>
      <input id="a" aria-invalid="true" aria-describedby="a-erro" />
      <p id="a-erro">Erro em A.</p>
      <label htmlFor="b">B</label>
      <input id="b" />
      <button type="button" tabIndex={-1}>
        Fora da tabulação
      </button>
      <button type="submit">Enviar</button>
    </form>
  );
}

describe("keyboard helpers (SC-012)", () => {
  it("tabSequence lista os elementos na ordem do Tab, sem os de tabIndex -1", async () => {
    render(<Example />);
    const sequence = await tabSequence(userEvent.setup());
    expect(sequence.map((el) => el.id || el.textContent)).toEqual(["a", "b", "Enviar"]);
  });

  it("expectTabOrder falha para ordem invertida e para elemento inalcançável", async () => {
    render(<Example />);
    const user = userEvent.setup();
    const [a, b] = [screen.getByLabelText("A"), screen.getByLabelText("B")];
    await expectTabOrder(user, [a, b]);
    await expect(expectTabOrder(user, [b, a])).rejects.toThrow(/ordem de tabulação/);
    await expect(expectTabOrder(user, [screen.getByText("Fora da tabulação")])).rejects.toThrow(/fora da ordem/);
  });

  it("expectFieldErrorLinked exige aria-invalid e mensagem de erro ligada", () => {
    render(<Example />);
    expectFieldErrorLinked(screen.getByLabelText("A"));
    expect(() => expectFieldErrorLinked(screen.getByLabelText("B"))).toThrow();
  });

  it("014/US3-3 expectFieldErrorLinked aceita o conteúdo editável ligado por aria-labelledby e exige um rótulo", () => {
    render(
      <form>
        <span id="codigo-rotulo">Solução esperada</span>
        <div
          id="codigo"
          role="textbox"
          contentEditable
          suppressContentEditableWarning
          aria-labelledby="codigo-rotulo"
          aria-invalid="true"
          aria-describedby="codigo-erro"
        />
        <div id="sem-rotulo" role="textbox" contentEditable suppressContentEditableWarning aria-invalid="true" aria-describedby="codigo-erro" />
        <p id="codigo-erro">Informe a solução esperada.</p>
      </form>,
    );
    expectFieldErrorLinked(screen.getByRole("textbox", { name: "Solução esperada" }));
    expect(() => expectFieldErrorLinked(document.getElementById("sem-rotulo")!)).toThrow(/sem rótulo/);
  });

  it("014/FR-010 tabSequence sai do editor de código com Esc e Tab, sem alterar o código", async () => {
    const onChange = vi.fn();
    render(
      <form>
        <input aria-label="antes" />
        <CodeEditor id="codigo" aria-label="Código" highlight={null} value="x" onChange={onChange} />
        <button type="submit">Enviar</button>
      </form>,
    );
    const content = await codeMirrorContent();
    const sequence = await tabSequence(userEvent.setup());
    expect(sequence).toEqual([screen.getByLabelText("antes"), content, screen.getByRole("button", { name: "Enviar" })]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
