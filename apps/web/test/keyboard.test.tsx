import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
