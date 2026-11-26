import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import type { DayMark } from "../schemas/day-kinds";
import { DayKindDialog } from "./day-kind-dialog";

// 031/US1 "Marcar dia" (contracts/ui.md "Teacher").
const KINDS = [
  "Aula",
  "Prova",
  "Trabalho",
  "Revisão",
  "Reposição",
  "Feriado",
  "Recesso",
  "Evento especial",
  "Falta do professor",
];

function open(mark: DayMark | null = null) {
  const onConfirm = vi.fn();
  const onUnmark = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <DayKindDialog
      date="2026-11-16"
      mark={mark}
      onConfirm={onConfirm}
      onUnmark={onUnmark}
      onCancel={onCancel}
    />,
  );
  const dialog = screen.getByRole("dialog", {
    name: "Marcar dia — segunda-feira, 16 de novembro de 2026",
  });
  return { ...view, dialog, onConfirm, onUnmark, onCancel };
}

const radio = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole("radio", { name }) as HTMLInputElement;

describe('031/US1 DayKindDialog — o modal "Marcar dia"', () => {
  it("031/US1-1 dia não marcado: data por extenso, os nove tipos, Aula escolhida e sem campo", async () => {
    const { dialog, baseElement } = open();
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((input) => input.getAttribute("value")),
    ).toHaveLength(9);
    expect(
      within(dialog).getByRole("group", { name: "Tipo do dia" }),
    ).toBeTruthy();
    for (const name of KINDS) expect(radio(dialog, name)).toBeTruthy();
    expect(radio(dialog, "Aula").checked).toBe(true);
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Desmarcar dia" }),
    ).toBeNull();
    await expectNoA11yViolations(baseElement);
  });

  it("031/US1-2 confirmar Aula marca o dia sem texto", async () => {
    const user = userEvent.setup();
    const { dialog, onConfirm } = open();
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        {
          kind: "CLASS",
          description: null,
          absenceReason: null,
          absenceNotice: null,
        },
        expect.anything(),
      ),
    );
  });

  it('031/US1-3 os tipos descritos mostram "Descrição" com a dica e não confirmam vazios ou só com espaços', async () => {
    const user = userEvent.setup();
    const { dialog, onConfirm, baseElement } = open();
    const hints: Record<string, string> = {
      Prova: "Qual prova? Ex.: P1 — Herança",
      Trabalho: "Entrega ou apresentação de qual trabalho?",
      Revisão: "Revisão de quê?",
      Reposição: "Reposição de qual aula?",
      Feriado: "Qual feriado?",
      Recesso: "Qual recesso?",
      "Evento especial": "Qual evento? Ex.: palestra, workshop",
    };
    for (const [kind, hint] of Object.entries(hints)) {
      await user.click(radio(dialog, kind));
      const field = within(dialog).getByRole("textbox", { name: /^Descrição/ });
      expect(field.getAttribute("aria-describedby")).toContain(
        "dia-descricao-dica",
      );
      expect(within(dialog).getByText(hint)).toBeTruthy();
    }

    await user.click(radio(dialog, "Feriado"));
    const description = within(dialog).getByRole("textbox", {
      name: /^Descrição/,
    });
    await user.type(description, "   ");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(
      await within(dialog).findByText("Escreva a descrição."),
    ).toBeTruthy();
    expect(description.getAttribute("aria-invalid")).toBe("true");
    expect(onConfirm).not.toHaveBeenCalled();

    // The counter counts what the teacher sees, and the limit is 120.
    await user.clear(description);
    await user.type(description, " Proclamação da República ");
    expect(within(dialog).getByText("24 de 120")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        {
          kind: "HOLIDAY",
          description: "Proclamação da República",
          absenceReason: null,
          absenceNotice: null,
        },
        expect.anything(),
      ),
    );
    await expectNoA11yViolations(baseElement);
  });

  it("031/US1-4 a Falta mostra o motivo obrigatório (só você vê), o aviso opcional e a nota sobre o que os alunos veem", async () => {
    const user = userEvent.setup();
    const { dialog, onConfirm, baseElement } = open();
    await user.click(radio(dialog, "Falta do professor"));

    expect(
      within(dialog).queryByRole("textbox", { name: /^Descrição/ }),
    ).toBeNull();
    const reason = within(dialog).getByRole("textbox", {
      name: /^Motivo \(só você vê\)/,
    });
    const notice = within(dialog).getByRole("textbox", {
      name: "Aviso para a turma (opcional)",
    });
    expect(reason.hasAttribute("required")).toBe(true);
    expect(notice.hasAttribute("required")).toBe(false);
    expect(
      within(dialog).getByText(
        "Os alunos veem “Falta do professor” e o aviso, nunca o motivo.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("0 de 500")).toBeTruthy();
    expect(within(dialog).getByText("0 de 200")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(await within(dialog).findByText("Escreva o motivo.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(reason, "Consulta médica");
    await user.type(notice, "Atividade no portal.");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        {
          kind: "TEACHER_ABSENCE",
          description: null,
          absenceReason: "Consulta médica",
          absenceNotice: "Atividade no portal.",
        },
        expect.anything(),
      ),
    );
    await expectNoA11yViolations(baseElement);
  });

  it('031/US1-6 dia marcado abre com o tipo e os textos atuais e oferece "Desmarcar dia"', async () => {
    const user = userEvent.setup();
    const { dialog, onUnmark } = open({
      kind: "TEACHER_ABSENCE",
      description: null,
      absenceReason: "Consulta médica",
      absenceNotice: "Atividade no portal.",
    });
    expect(radio(dialog, "Falta do professor").checked).toBe(true);
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /^Motivo/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Consulta médica");
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /^Aviso/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Atividade no portal.");

    await user.click(
      within(dialog).getByRole("button", { name: "Desmarcar dia" }),
    );
    expect(onUnmark).toHaveBeenCalledOnce();
  });

  it("031/FR-006 mudar Prova → Aula confirma sem a descrição", async () => {
    const user = userEvent.setup();
    const { dialog, onConfirm } = open({
      kind: "EXAM",
      description: "P1",
      absenceReason: null,
      absenceNotice: null,
    });
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /^Descrição/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("P1");
    await user.click(radio(dialog, "Aula"));
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        {
          kind: "CLASS",
          description: null,
          absenceReason: null,
          absenceNotice: null,
        },
        expect.anything(),
      ),
    );
  });

  it('"Cancelar" e Esc fecham sem marcar', async () => {
    const user = userEvent.setup();
    const { dialog, onCancel, onConfirm } = open();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("031/FR-024 sem violações de acessibilidade nos temas escuro e claro, com a Falta aberta", async () => {
    try {
      for (const theme of ["dark", "light"] as const) {
        document.documentElement.dataset.theme = theme;
        const { baseElement, unmount } = open({
          kind: "TEACHER_ABSENCE",
          description: null,
          absenceReason: "Consulta médica",
          absenceNotice: "Atividade no portal.",
        });
        await expectNoA11yViolations(baseElement);
        unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
