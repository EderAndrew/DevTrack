import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { ExamAlert, LEAVE_ATTEMPT } from "./exam-alert";

// 015/FR-012 (design-system/exam-mode.md, "tentativa de sair da página"): the confirmation never
// blocks the way out; the official texts, focus kept inside, Esc stays.

function Host({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Sair
      </button>
      <ExamAlert open={open} onOpenChange={setOpen} text={LEAVE_ATTEMPT} confirmLabel="Sair da avaliação" onConfirm={onConfirm} />
    </>
  );
}

describe("015/FR-012 ExamAlert", () => {
  it("015/US2-5 \"Sair da avaliação?\" com o registro e o que fazer; sair confirma", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Sair" }));
    const dialog = screen.getByRole("alertdialog", { name: "Sair da avaliação?" });
    expect(dialog.textContent).toContain("Sua tentativa continua em andamento.");
    expect(dialog.textContent).toContain(LEAVE_ATTEMPT.guidance);
    expect(dialog.textContent).not.toMatch(/viola|fraude|cola|puni|tempo continua/i);
    await expectNoA11yViolations(document.body);
    await user.click(screen.getByRole("button", { name: "Sair da avaliação" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("\"Continuar respondendo\" e Esc fecham sem sair; o foco começa em continuar e volta a \"Sair\"", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Sair" });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continuar respondendo" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Continuar respondendo" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
