import type { ClassPlanView, TopicView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { TopicResolutionDialog } from "../../class-calendar/components/topic-resolution-dialog";
import { ClassPlanPage } from "./class-plan-view";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

describe("004/US9 aula concluída no planejamento (FR-056 – FR-058)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  // A class day long past and one far ahead, so "today" never falls between them.
  const past = meetingView("2020-03-04", 1, 2);
  const future = meetingView("2999-03-04", 2, 1);

  const writes = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method && init.method !== "GET")
      .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init!.body)) as Record<string, unknown> }));

  function serve(initial: ClassPlanView, respond: (url: string) => Response | ClassPlanView = () => initial, archived: TopicView[] = []) {
    let plan = initial;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method && init.method !== "GET") {
        const answer = respond(url);
        if (answer instanceof Response) return answer;
        plan = answer;
        return json(200, answer);
      }
      if (url.endsWith("/plan/coverage")) return json(200, coverageView([{ title: "POO", items: ["Classes"] }]));
      if (url.includes("/plan/topics?status=ARCHIVED")) return json(200, { items: archived });
      return json(200, envelope(plan));
    });
  }

  const plan = (topics: TopicView[], overrides: Partial<ClassPlanView> = {}) =>
    planView({ status: "ACTIVE", revision: 8, meetings: [past, future], topics, ...overrides });
  const taught = (status: TopicView["status"] = "ACTIVE") =>
    topicView("Conceitos de classes", {
      status,
      position: 1,
      meetingId: past.id,
      completedOn: status === "COMPLETED" ? past.date : null,
    });
  const neighbour = topicView("Objetos e métodos", { status: "ACTIVE", position: 2, meetingId: past.id });
  const upcoming = topicView("Herança", { status: "ACTIVE", position: 3, meetingId: future.id });

  it("004/US9-1 \"Concluir aula\" num tópico de aula passada envia a conclusão e mostra a marca verde", async () => {
    const user = userEvent.setup();
    const topic = taught();
    const done = plan([{ ...topic, status: "COMPLETED", completedOn: past.date }, neighbour, upcoming], { revision: 9 });
    serve(plan([topic, neighbour, upcoming]), () => done);
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Concluir aula de Conceitos de classes" }));

    expect(await screen.findByText("Aula concluída.")).toBeTruthy();
    expect(writes()).toEqual([
      { url: `/api/classes/${CLASS_ID}/plan/topics/${topic.id}/complete`, body: { planRevision: 8 } },
    ]);
    const card = screen.getByRole("heading", { name: "Conceitos de classes" }).closest("li")!;
    expect(within(card).getByText("Aula concluída")).toBeTruthy();
    // "Reabrir aula" sits beside the title, not in the row of actions below the items.
    const header = screen.getByRole("heading", { name: "Conceitos de classes" }).parentElement!;
    expect(within(header).getByRole("button", { name: "Reabrir aula de Conceitos de classes" })).toBeTruthy();
  });

  it("004/US9-2 004/FR-057 tópico concluído: só Arquivar e Reabrir aula habilitados; o vizinho não troca de lugar com ele", async () => {
    serve(plan([taught("COMPLETED"), neighbour, upcoming]));
    const { container } = renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    const disabled = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
    await screen.findByRole("button", { name: "Reabrir aula de Conceitos de classes" });
    for (const name of ["Editar", "Subir", "Descer", "Dividir"]) expect(disabled(`${name} Conceitos de classes`), name).toBe(true);
    expect(disabled("Arquivar Conceitos de classes")).toBe(false);
    expect(disabled("Reabrir aula de Conceitos de classes")).toBe(false);
    expect((screen.getByLabelText("Aula de Conceitos de classes") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Juntar Conceitos de classes") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Concluir aula de Conceitos de classes" })).toBeNull();
    // "Subir" of the next topic would swap it with the completed one.
    expect(disabled("Subir Objetos e métodos")).toBe(true);
    expect(disabled("Editar Objetos e métodos")).toBe(false);
    await expectNoA11yViolations(container);
  });

  it("004/US9-3 sem \"Concluir aula\" em aula futura, em tópico sem aula ou com o planejamento fora de andamento; a recusa da API aparece", async () => {
    const user = userEvent.setup();
    const unscheduled = topicView("Revisão", { status: "ACTIVE", position: 4 });
    serve(plan([taught(), neighbour, upcoming, unscheduled]), () => apiError(422, "MEETING_NOT_HELD_YET", "x"));
    const { unmount } = renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await screen.findByRole("button", { name: "Concluir aula de Conceitos de classes" });
    expect(screen.queryByRole("button", { name: "Concluir aula de Herança" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Concluir aula de Revisão" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Concluir aula de Conceitos de classes" }));
    expect(await screen.findByText("Só é possível concluir uma aula a partir da data dela.")).toBeTruthy();
    unmount();

    serve(plan([taught(), neighbour], { status: "READY" }));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);
    await screen.findByRole("button", { name: "Editar Conceitos de classes" });
    expect(screen.queryByRole("button", { name: /Concluir aula/ })).toBeNull();
  });

  it("004/US9-4 \"Reabrir aula\" envia a reabertura e libera os controles", async () => {
    const user = userEvent.setup();
    const topic = taught("COMPLETED");
    serve(plan([topic, neighbour]), () => plan([{ ...topic, status: "ACTIVE", completedOn: null }, neighbour], { revision: 9 }));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Reabrir aula de Conceitos de classes" }));

    expect(await screen.findByText("Aula reaberta.")).toBeTruthy();
    expect(writes()).toEqual([{ url: `/api/classes/${CLASS_ID}/plan/topics/${topic.id}/reopen`, body: { planRevision: 8 } }]);
    expect((screen.getByRole("button", { name: "Editar Conceitos de classes" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Aula concluída", { selector: "span" })).toBeNull();
  });

  it("004/US9-5 arquivado depois de concluído: \"Aula concluída em <data>\" e sem Restaurar", async () => {
    const archivedTaught = topicView("Conceitos de classes", { status: "ARCHIVED", completedOn: "2020-03-04", position: 5 });
    const archivedOther = topicView("Bibliotecas", { status: "ARCHIVED", position: 6 });
    serve(plan([neighbour], { archivedTopicCount: 2 }), undefined, [archivedTaught, archivedOther]);
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    expect(await screen.findByText("Aula concluída em 04/03/2020.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar Conceitos de classes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar Bibliotecas" })).toBeTruthy();
  });

  it("004/US9-6 desmarcar a aula: o tópico concluído só pode ser arquivado", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const topic = taught("COMPLETED");
    renderWithProviders(
      <TopicResolutionDialog
        meetingDate={past.date}
        topics={[topic]}
        moveTargets={[{ date: future.date, label: "Aula 01 — 04/03/2999" }]}
        mergeCandidates={[upcoming]}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Aula concluída: este tópico só pode ser arquivado.")).toBeTruthy();
    for (const label of ["Mover para outra aula", "Deixar sem data", "Juntar com outro tópico"]) {
      expect((within(dialog).getByLabelText(label) as HTMLInputElement).disabled, label).toBe(true);
    }
    await user.click(within(dialog).getByLabelText("Arquivar"));
    await user.click(within(dialog).getByRole("button", { name: "Desmarcar aula" }));
    expect(onConfirm).toHaveBeenCalledWith([{ topicId: topic.id, action: "ARCHIVE" }]);
  });
});
