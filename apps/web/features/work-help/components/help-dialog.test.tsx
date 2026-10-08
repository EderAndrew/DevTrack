import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { Button } from "@/components/ui/button";
import { HELP_NOTE } from "../schemas/work-help";
import { HelpDialog } from "./help-dialog";

function Harness({ onSend, error = null }: { onSend: (question: string) => void; error?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <HelpDialog
      trigger={<Button type="button">Pedir ajuda</Button>}
      open={open}
      onOpenChange={setOpen}
      questionId="q1"
      pending={false}
      error={error}
      onSend={onSend}
    />
  );
}

describe("015/US3-1 diálogo \"Pedir ajuda\"", () => {
  it("o aviso de que a IA orienta sem dar a resposta, o campo com contador e o envio", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);
    await user.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    const dialog = screen.getByRole("dialog", { name: "Pedir ajuda à IA" });
    expect(dialog.textContent).toContain(HELP_NOTE);
    expect(screen.getByText("0 de 500 caracteres")).toBeTruthy();
    const field = screen.getByRole("textbox", { name: /Sua pergunta sobre esta questão/ });
    expect(field.getAttribute("maxlength")).toBe("500");
    await user.type(field, "  Como começo?  ");
    expect(screen.getByText("16 de 500 caracteres")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).toHaveBeenCalledWith("Como começo?");
    await expectNoA11yViolations(document.body);
  });

  it("015/FR-016 pergunta vazia é recusada antes de chegar à API", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);
    await user.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    await user.type(screen.getByRole("textbox"), "   ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Escreva a sua pergunta.")).toBeTruthy();
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("teclado: o foco fica no diálogo, Esc fecha e o foco volta a \"Pedir ajuda\"", async () => {
    const user = userEvent.setup();
    render(<Harness onSend={vi.fn()} />);
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Pedir ajuda");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Pedir ajuda");
  });

  it("a recusa da API aparece no diálogo; no modo NORMAL, colar no campo não é impedido", async () => {
    const user = userEvent.setup();
    render(<Harness onSend={vi.fn()} error="Aguarde a orientação anterior." />);
    await user.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    expect(screen.getByText("Aguarde a orientação anterior.")).toBeTruthy();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("textbox"), event);
    expect(event.defaultPrevented).toBe(false);
  });
});
