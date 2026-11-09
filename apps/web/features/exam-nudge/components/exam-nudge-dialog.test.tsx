import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { NUDGE_ACKNOWLEDGE, NUDGE_TITLE, nudgeText } from "../schemas/exam-nudge";
import type { ShownNudge } from "../hooks/use-exam-nudge";
import { ExamNudgeDialog } from "./exam-nudge-dialog";

// 025/US2 (contracts/ui.md, "Student — exam page (web)"): the Design System's alert dialog with the fixed text and
// the student's name; "Entendi" or Escape close it at once and the focus goes back where it was.

const NUDGE: ShownNudge = { id: "00000000-0000-4000-8000-000000000901", studentName: "Ana Souza" };

function Page({ onAcknowledge }: { onAcknowledge: (id: string) => void }) {
  const [nudge, setNudge] = useState<ShownNudge | null>(null);
  return (
    <>
      <label>
        Resposta
        <input />
      </label>
      <button type="button" onClick={() => setNudge(NUDGE)}>
        Mostrar
      </button>
      <ExamNudgeDialog
        nudge={nudge}
        onAcknowledge={(id) => {
          onAcknowledge(id);
          setNudge(null);
        }}
      />
    </>
  );
}

describe("025/US2 ExamNudgeDialog", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("025/US2-1 025/US2-8 alertdialog “Mensagem do professor” com o texto exato e o nome do servidor; nunca “Aviso”", () => {
    render(<ExamNudgeDialog nudge={NUDGE} onAcknowledge={vi.fn()} />);
    const dialog = screen.getByRole("alertdialog", { name: NUDGE_TITLE });
    expect(dialog.textContent).toContain(
      "Ana Souza, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.",
    );
    expect(nudgeText("Ana Souza")).toBe("Ana Souza, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.");
    expect(NUDGE_TITLE).not.toMatch(/aviso/i);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([NUDGE_ACKNOWLEDGE]);
    // The one answer takes the focus (trapped by Radix).
    expect(document.activeElement).toBe(screen.getByRole("button", { name: NUDGE_ACKNOWLEDGE }));
  });

  it("sem aviso, nada na tela", () => {
    render(<ExamNudgeDialog nudge={null} onAcknowledge={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("025/US2-2 “Entendi” fecha na hora, uma vez, e o foco volta para onde estava", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(<Page onAcknowledge={onAcknowledge} />);
    const opener = screen.getByRole("button", { name: "Mostrar" });
    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: NUDGE_ACKNOWLEDGE }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onAcknowledge.mock.calls).toEqual([[NUDGE.id]]);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("025/US2-2 Escape faz o mesmo que “Entendi”", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(<Page onAcknowledge={onAcknowledge} />);
    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onAcknowledge.mock.calls).toEqual([[NUDGE.id]]);
  });

  it.each(["dark", "light"])("025/US2-8 vitest-axe sem violações no tema %s", async (theme) => {
    document.documentElement.dataset.theme = theme;
    render(<ExamNudgeDialog nudge={NUDGE} onAcknowledge={vi.fn()} />);
    await screen.findByRole("alertdialog");
    await expectNoA11yViolations(document.body);
  });
});
