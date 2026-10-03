import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ActivityDetail, EDIT_FIELD_IDS, VERSION_CONFLICT_NOTICE } from "./activity-detail";
import { ACTIVITY_ID, activity, apiError, CLASS_ID, json, routedFetch } from "./test-fixtures";

const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function setup(routes: Parameters<typeof routedFetch>[0] = {}, canApply = true) {
  const api = routedFetch({ [`GET ${PATH}`]: json(200, activity()), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply={canApply} />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US1 ActivityDetail — dados, edição, gabarito, alunos, encerrar e cancelar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US1-8 mostra os dados, a regra de atraso, o gabarito e a situação de cada aluno em palavras", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Lista de herança" })).toBeTruthy();
    expect(screen.getByText("Publicada")).toBeTruthy();
    expect(screen.getByText("Não aceitar", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Entregas: 12 de 30")).toBeTruthy();
    const roster = screen.getByRole("table", { name: /Situação de cada aluno/ });
    expect(within(roster).getByText("Não iniciou")).toBeTruthy();
    const questions = screen.getByRole("region", { name: "Questões e gabarito" });
    expect(within(questions).getByText("(correta)").parentElement!.textContent).toBe("extends (correta)");
    expect(within(questions).getByText("Vale 1,00")).toBeTruthy();
  });

  it("012/US1-8 edita a regra de atraso e o prazo: só o que mudou, com a versão lida", async () => {
    const { api, user } = setup({ [`PATCH ${PATH}`]: json(200, activity({ latePolicy: "ACCEPT_MARKED", version: 3 })) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await user.click(screen.getByRole("radio", { name: "Aceitar e marcar como atrasada" }));
    fireEvent.change(field(EDIT_FIELD_IDS.deadline), { target: { value: "2030-10-12T18:00" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({
      version: 2,
      deadline: new Date("2030-10-12T18:00").toISOString(),
      latePolicy: "ACCEPT_MARKED",
    });
  });

  it("012/US1-5 a data de publicação só muda enquanto agendada; prazo antes dela é recusado no campo", async () => {
    const { api, user } = setup();
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(field(EDIT_FIELD_IDS.publishAt).readOnly).toBe(true);
    fireEvent.change(field(EDIT_FIELD_IDS.deadline), { target: { value: "2020-01-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expectFieldErrorLinked(field(EDIT_FIELD_IDS.deadline));
    expect(api.writes()).toEqual([]);
  });

  it("012/FR-004 outra aba mudou a atividade: recarrega e avisa", async () => {
    const { api, user } = setup({
      [`PATCH ${PATH}`]: apiError(409, "ACTIVITY_VERSION_CONFLICT", "Esta atividade mudou em outra aba. Recarregue para ver a versão atual."),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    await user.clear(field(EDIT_FIELD_IDS.title));
    await user.type(field(EDIT_FIELD_IDS.title), "Outro título");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText(VERSION_CONFLICT_NOTICE)).toBeTruthy();
    expect(api.calls.filter((call) => call.method === "GET" && call.url === PATH)).toHaveLength(2);
  });

  it("012/US1-8 cancelar pede confirmação (ação de perigo) e só então envia; encerrar também confirma", async () => {
    const { api, user } = setup({
      [`POST ${PATH}/cancel`]: json(200, activity({ status: "CANCELLED", phase: null, version: 3 })),
      [`POST ${PATH}/close`]: json(200, activity({ status: "CLOSED", phase: null, version: 3 })),
    });
    const cancel = await screen.findByRole("button", { name: "Cancelar atividade" });
    expect(cancel.getAttribute("data-variant") ?? cancel.className).toMatch(/danger/);
    await user.click(cancel);
    const dialog = await screen.findByRole("alertdialog", { name: "Cancelar esta atividade?" });
    expect(api.writes()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(api.writes()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Encerrar atividade" }));
    const closeDialog = await screen.findByRole("alertdialog", { name: "Encerrar esta atividade?" });
    await user.click(within(closeDialog).getByRole("button", { name: "Encerrar atividade" }));
    expect(await screen.findByText("Atividade encerrada.")).toBeTruthy();
    expect(api.writes().map((call) => [call.method, call.url, call.body])).toEqual([["POST", `${PATH}/close`, {}]]);
    expect(screen.getByText("Encerrada")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Editar atividade" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancelar atividade" }));
    const again = await screen.findByRole("alertdialog", { name: "Cancelar esta atividade?" });
    await user.click(within(again).getByRole("button", { name: "Cancelar atividade" }));
    expect(await screen.findByText("Atividade cancelada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar atividade" })).toBeNull();
  });

  it("sem atividades.aplicar não há edição nem ações", async () => {
    setup({}, false);
    await screen.findByRole("heading", { name: "Lista de herança" });
    expect(screen.queryByRole("form", { name: "Editar atividade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar atividade" })).toBeNull();
  });

  it("012/US1-8 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup();
    await screen.findByRole("form", { name: "Editar atividade" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Encerrar atividade" }),
      screen.getByRole("button", { name: "Cancelar atividade" }),
      field(EDIT_FIELD_IDS.title),
      field(EDIT_FIELD_IDS.instructions),
      field(EDIT_FIELD_IDS.deadline),
      screen.getByRole("radio", { name: "Não aceitar" }),
      screen.getByRole("button", { name: "Salvar alterações" }),
    ]);
  });
});
