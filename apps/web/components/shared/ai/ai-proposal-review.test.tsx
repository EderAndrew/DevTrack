import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { AiProposalReview, type AiProposalReviewItem } from "./ai-proposal-review";

const ITEMS: AiProposalReviewItem[] = [
  { id: "t1", label: "Introdução à orientação a objetos", description: "Classes, objetos e mensagens." },
  { id: "t2", label: "Herança e polimorfismo" },
  { id: "t3", label: "Interfaces" },
];

function setup(props: Partial<React.ComponentProps<typeof AiProposalReview>> = {}) {
  const onDecide = vi.fn();
  const user = userEvent.setup();
  const view = render(<AiProposalReview items={ITEMS} status="READY_FOR_REVIEW" onDecide={onDecide} {...props} />);
  return { ...view, user, onDecide };
}

async function confirm(user: ReturnType<typeof userEvent.setup>, action: string) {
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: action }));
}

describe("006/US9-3 AiProposalReview: aprovar, aprovar em parte e rejeitar, com confirmação", () => {
  it("todos os itens começam marcados; sem Aprovar selecionados; sem violações de acessibilidade", async () => {
    const { container } = setup();
    for (const item of ITEMS) expect((screen.getByLabelText(item.label) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(ITEMS[0]!.label).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar selecionados" })).toBeNull();
    expect(screen.getByRole("button", { name: "Aprovar tudo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejeitar" }).getAttribute("data-variant")).toBe("danger");
    await expectNoA11yViolations(container);
  });

  it("Aprovar tudo pede confirmação e decide APPROVE", async () => {
    const { user, onDecide } = setup();
    await user.click(screen.getByRole("button", { name: "Aprovar tudo" }));
    expect(onDecide).not.toHaveBeenCalled();
    await confirm(user, "Aprovar tudo");
    expect(onDecide).toHaveBeenCalledWith("APPROVE", undefined);
  });

  it("Aprovar selecionados só aparece com um subconjunto próprio e decide com os ids marcados", async () => {
    const { user, onDecide } = setup();
    await user.click(screen.getByLabelText(ITEMS[1]!.label));
    await user.click(screen.getByRole("button", { name: "Aprovar selecionados" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Aprovar 2 de 3 itens?");
    await confirm(user, "Aprovar selecionados");
    expect(onDecide).toHaveBeenCalledWith("APPROVE_PARTIALLY", ["t1", "t3"]);

    for (const item of ITEMS) {
      const box = screen.getByLabelText(item.label) as HTMLInputElement;
      if (box.checked) await user.click(box);
    }
    expect(screen.queryByRole("button", { name: "Aprovar selecionados" })).toBeNull();
  });

  it("Rejeitar pede confirmação; Cancelar não decide nada e devolve o foco ao botão", async () => {
    const { user, onDecide } = setup();
    const reject = screen.getByRole("button", { name: "Rejeitar" });
    await user.click(reject);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(reject);
    await user.click(reject);
    await confirm(user, "Rejeitar");
    expect(onDecide).toHaveBeenCalledWith("REJECT", undefined);
  });

  it("006/SC-012 operável só pelo teclado: Tab passa pelos itens e pelas ações, Espaço e Enter decidem", async () => {
    const { user, onDecide } = setup();
    await expectTabOrder(user, [
      ...ITEMS.map((item) => screen.getByLabelText(item.label)),
      screen.getByRole("button", { name: "Aprovar tudo" }),
      screen.getByRole("button", { name: "Rejeitar" }),
    ]);
    screen.getByLabelText(ITEMS[2]!.label).focus();
    await user.keyboard(" ");
    const partial = screen.getByRole("button", { name: "Aprovar selecionados" });
    partial.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    within(dialog).getByRole("button", { name: "Aprovar selecionados" }).focus();
    await user.keyboard("{Enter}");
    expect(onDecide).toHaveBeenCalledWith("APPROVE_PARTIALLY", ["t1", "t2"]);
  });

  it("somente leitura quando já decidida: sem caixas nem ações, com a situação", async () => {
    const { container } = setup({ status: "PARTIALLY_APPROVED" });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Aprovada em parte");
    expect(screen.getByText(ITEMS[0]!.label)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("pending desabilita caixas e ações", () => {
    setup({ pending: true });
    expect((screen.getByRole("button", { name: "Aprovar tudo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(ITEMS[0]!.label) as HTMLInputElement).disabled).toBe(true);
  });

  it("o conteúdo da proposta é texto, nunca HTML", () => {
    const { container } = setup({ items: [{ id: "x", label: '<img src=x onerror="alert(1)">', description: "<b>negrito</b>" }] });
    expect(container.querySelector("img, b")).toBeNull();
    expect(screen.getByText("<b>negrito</b>")).toBeTruthy();
  });
});
