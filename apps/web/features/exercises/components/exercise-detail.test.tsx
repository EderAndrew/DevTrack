import type { ExerciseTeacherView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExerciseDetail } from "./exercise-detail";
import { apiError, exerciseView, json } from "./test-fixtures";

const approved = exerciseView({ statement: "Explique a herança", expectedAnswer: "Reuso por extensão", version: 4 });

describe("010/US5 ExerciseDetail — ver, editar, arquivar e restaurar", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { method: string; url: string; body: unknown }[] = [];
  let current: ExerciseTeacherView;
  let answer: (method: string, url: string, body: Record<string, unknown>) => Response;

  beforeEach(() => {
    writes.length = 0;
    current = approved;
    answer = (_method, url, body) => {
      if (url.endsWith("/archive")) current = { ...current, status: "ARCHIVED", archivedFromStatus: current.status, version: current.version + 1 };
      else if (url.endsWith("/restore")) current = { ...current, status: current.archivedFromStatus!, archivedFromStatus: null, version: current.version + 1 };
      else current = { ...current, statement: String(body.statement), version: current.version + 1 };
      return json(200, current);
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET") return url === `/api/exercises/${approved.id}` ? json(200, current) : apiError(404, "NOT_FOUND", "Não encontrado.");
      const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
      writes.push({ method, url, body });
      return answer(method, url, body);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra o exercício inteiro, a situação e a origem em palavras; sem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit />);
    expect(await screen.findByText("Explique a herança")).toBeTruthy();
    expect(screen.getByText("Reuso por extensão")).toBeTruthy();
    expect(screen.getByText("Aprovado")).toBeTruthy();
    expect(screen.getByText(/Origem: Manual/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("010/US5-4 arquivar pede confirmação, envia a versão lida e passa a oferecer só restaurar", async () => {
    renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Arquivar este exercício?" });
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Arquivar exercício" }));
    await screen.findByText("Exercício arquivado.");
    expect(writes).toEqual([{ method: "POST", url: `/api/exercises/${approved.id}/archive`, body: { version: 4 } }]);
    expect(await screen.findByText("Arquivado")).toBeTruthy();
    expect(screen.getByText("Arquivado. Ao restaurar, volta a aprovado.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await screen.findByText("Exercício restaurado.");
    expect(writes.at(-1)).toEqual({ method: "POST", url: `/api/exercises/${approved.id}/restore`, body: { version: 5 } });
    expect(await screen.findByText("Aprovado")).toBeTruthy();
  });

  it("010/US5-3 editar um aprovado envia o conteúdo com a versão e ele continua aprovado", async () => {
    renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByRole("form", { name: "Editar exercício" })).toBeTruthy();
    const statement = screen.getByLabelText(/^Enunciado/);
    await user.clear(statement);
    await user.type(statement, "Explique a herança simples");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Exercício salvo.");
    expect(writes).toMatchObject([{ method: "PUT", url: `/api/exercises/${approved.id}`, body: { type: "OPEN_ANSWER", statement: "Explique a herança simples", version: 4 } }]);
    expect(await screen.findByText("Explique a herança simples")).toBeTruthy();
    expect(screen.getByText("Aprovado")).toBeTruthy();
  });

  it("uma versão desatualizada aparece como aviso de conflito", async () => {
    answer = () => apiError(409, "EXERCISE_VERSION_CONFLICT", "conflito");
    renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Arquivar exercício" }));
    expect(await screen.findByText(/Este exercício foi alterado depois que você o abriu/)).toBeTruthy();
  });

  it("sem questoes.editar não há ações; um exercício de outro professor é não encontrado", async () => {
    const { unmount } = renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit={false} />);
    await screen.findByText("Explique a herança");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Arquivar" })).toBeNull();
    unmount();
    renderWithProviders(<ExerciseDetail exerciseId="00000000-0000-4000-c000-999999999999" canEdit />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("SC-012 a ordem de Tab passa por Editar e Arquivar", async () => {
    renderWithProviders(<ExerciseDetail exerciseId={approved.id} canEdit />);
    const user = userEvent.setup();
    await expectTabOrder(user, [await screen.findByRole("button", { name: "Editar" }), screen.getByRole("button", { name: "Arquivar" })]);
  });
});
