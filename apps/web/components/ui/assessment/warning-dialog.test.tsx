import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { OCCURRENCE_LABELS, WarningDialog, warningText } from "./warning-dialog";

// 018/US4-1, US4-2, US4-3 (contracts/web-ui.md, "Warning dialog"): after each counted occurrence,
// "Aviso n de 3 — <tipo da ocorrência>. Na 4ª ocorrência a prova será encerrada." in a modal that
// needs the student's answer ("Voltar à prova", which also returns to fullscreen), neutral words only.

describe("018/US4 WarningDialog", () => {
  it("018/US4-1 mostra “Aviso n de 3” com o tipo da ocorrência e a regra do encerramento", () => {
    render(<WarningDialog open ordinal={1} kind="SCREEN" onReturn={() => undefined} />);
    expect(screen.getByRole("alertdialog", { name: "Aviso 1 de 3", description: "Você saiu da tela da prova. Na 4ª ocorrência a prova será encerrada." })).toBeTruthy();
    expect(warningText(1, "SCREEN")).toBe("Aviso 1 de 3: você saiu da tela da prova. Na 4ª ocorrência a prova será encerrada.");
  });

  it("018/US4-2 018/US4-3 cada tipo tem o seu texto, e o número acompanha o aviso", () => {
    const { rerender } = render(<WarningDialog open ordinal={2} kind="CLIPBOARD" onReturn={() => undefined} />);
    expect(screen.getByRole("alertdialog", { name: "Aviso 2 de 3", description: `${OCCURRENCE_LABELS.CLIPBOARD}. Na 4ª ocorrência a prova será encerrada.` })).toBeTruthy();
    rerender(<WarningDialog open ordinal={3} kind="INACTIVITY" onReturn={() => undefined} />);
    expect(screen.getByRole("alertdialog", { name: "Aviso 3 de 3", description: `${OCCURRENCE_LABELS.INACTIVITY}. Na 4ª ocorrência a prova será encerrada.` })).toBeTruthy();
  });

  it("018/US4-8 nenhum texto fala em fraude, cola ou violação", () => {
    for (const kind of Object.keys(OCCURRENCE_LABELS) as (keyof typeof OCCURRENCE_LABELS)[]) {
      expect(warningText(3, kind)).not.toMatch(/fraude|\bcola\b|viola[cç][aã]o/i);
    }
  });

  it("o foco vai para “Voltar à prova”; Enter ou Esc voltam à prova", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const { rerender } = render(<WarningDialog open ordinal={1} kind="FULLSCREEN" onReturn={onReturn} />);
    const back = screen.getByRole("button", { name: "Voltar à prova" });
    expect(document.activeElement).toBe(back);
    await user.keyboard("{Enter}");
    expect(onReturn).toHaveBeenCalledTimes(1);
    rerender(<WarningDialog open={false} ordinal={1} kind="FULLSCREEN" onReturn={onReturn} />);
    rerender(<WarningDialog open ordinal={2} kind="SCREEN" onReturn={onReturn} />);
    await user.keyboard("{Escape}");
    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it("o Tab fica dentro do aviso", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Fora</button>
        <WarningDialog open ordinal={1} kind="SCREEN" onReturn={() => undefined} />
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Voltar à prova" }));
  });

  it("sem violações de acessibilidade", async () => {
    const { baseElement } = render(<WarningDialog open ordinal={2} kind="CLIPBOARD" onReturn={() => undefined} />);
    await expectNoA11yViolations(baseElement);
  });
});
