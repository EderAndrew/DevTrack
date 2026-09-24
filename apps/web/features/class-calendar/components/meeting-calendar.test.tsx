import type { ClassMeetingList, ClassMeetingView, ClassPlanEnvelope, TopicView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { classMeetingsKeys } from "../hooks/use-class-meetings";
import { MeetingCalendar } from "./meeting-calendar";

const CLASS_ID = "00000000-0000-4000-9000-000000000444";
const PERIOD = { startsOn: "2027-02-02", endsOn: "2027-06-30" };

let sequence = 0;
const uuid = () => `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, "0")}`;

const meeting = (date: string, number: number, topicCount = 0): ClassMeetingView => ({
  id: uuid(),
  date,
  number,
  status: "PLANNED",
  topicCount,
});
const meetingList = (items: ClassMeetingView[], planRevision: number | null = null): ClassMeetingList => ({
  items,
  total: items.length,
  planRevision,
});
const topic = (title: string, meetingId: string | null, position: number): TopicView => ({
  id: uuid(),
  title,
  description: null,
  position,
  meetingId,
  origin: "MANUAL",
  status: "DRAFT",
  items: [],
  mergedIntoTopicId: null,
  splitFromTopicId: null,
  createdAt: "2027-01-10T12:00:00.000Z",
  updatedAt: "2027-01-10T12:00:00.000Z",
});
const planEnvelope = (meetings: ClassMeetingView[], topics: TopicView[], revision: number): ClassPlanEnvelope => ({
  plan: {
    id: uuid(),
    classId: CLASS_ID,
    status: "DRAFT",
    revision,
    syllabus: { subjectId: uuid(), documentId: uuid(), documentVersion: 1, revisionId: uuid(), revisionNumber: 1 },
    meetings,
    topics,
    archivedTopicCount: 0,
  },
});

/** The day button of "YYYY-MM-DD" (the shadcn `CalendarDayButton` marks it with `data-day` in pt-BR). */
const dayButton = (container: HTMLElement, date: string) => {
  const [year, month, day] = date.split("-");
  const button = container.querySelector<HTMLButtonElement>(`button[data-day="${day}/${month}/${year}"]`);
  if (!button) throw new Error(`dia ${date} não está na tela`);
  return button;
};

describe("004/US4 MeetingCalendar — calendário de encontros da turma", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const putCalls = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PUT")
      .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init!.body)) as unknown }));

  function renderCalendar(list: ClassMeetingList, options: { canEdit?: boolean; plan?: ClassPlanEnvelope } = {}) {
    fetchMock.mockImplementation(async () => json(200, list));
    const queryClient = makeTestQueryClient();
    if (options.plan) queryClient.setQueryData(classMeetingsKeys.plan(CLASS_ID), options.plan);
    return renderWithProviders(<MeetingCalendar classId={CLASS_ID} {...PERIOD} canEdit={options.canEdit ?? true} />, {
      queryClient,
    });
  }

  it("004/FR-052 mês com dia da semana, dias fora do período desabilitados, total e lista numerada", async () => {
    const { container } = renderCalendar(meetingList([meeting("2027-02-03", 1), meeting("2027-02-10", 2)]));

    expect(await screen.findByText("Total de aulas selecionadas: 2")).toBeTruthy();
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-label")).toMatch(/fevereiro/i);
    // The weekday row is hidden from the accessibility tree; each day button names its weekday.
    const weekdays = [...grid.querySelectorAll("th")];
    expect(weekdays.map((th) => th.getAttribute("aria-label"))).toEqual([
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ]);
    expect(dayButton(container, "2027-02-03").getAttribute("aria-label")).toMatch(/^quarta-feira, 3 de fevereiro de 2027/);

    expect(dayButton(container, "2027-02-01").disabled).toBe(true);
    expect(dayButton(container, "2027-02-02").disabled).toBe(false);
    expect(container.querySelector('button[data-day="31/01/2027"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Mês anterior" }).getAttribute("aria-disabled")).toBe("true");

    const list = screen.getByRole("list", { name: "Aulas selecionadas" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Aula 01 — 03/02/2027",
      "Aula 02 — 10/02/2027",
    ]);
    await expectNoA11yViolations(container);
  });

  it("004/FR-052 setas movem o foco, PageUp/PageDown trocam o mês, Espaço/Enter marcam", async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar(meetingList([meeting("2027-02-03", 1)]));
    await screen.findByText("Total de aulas selecionadas: 1");

    dayButton(container, "2027-02-03").focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(dayButton(container, "2027-02-04"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(dayButton(container, "2027-02-11"));

    await user.keyboard(" ");
    expect(screen.getByText("Total de aulas selecionadas: 2")).toBeTruthy();

    await user.keyboard("{PageDown}");
    await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-label")).toMatch(/março/i));
    expect(document.activeElement).toBe(dayButton(container, "2027-03-11"));
    await user.keyboard("{Enter}");
    expect(screen.getByText("Total de aulas selecionadas: 3")).toBeTruthy();

    await user.keyboard("{PageUp}");
    await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-label")).toMatch(/fevereiro/i));
    expect(document.activeElement).toBe(dayButton(container, "2027-02-11"));
    await user.keyboard("{Enter}");
    expect(screen.getByText("Total de aulas selecionadas: 2")).toBeTruthy();
  });

  it("004/US4-4 004/US4-5 \"Salvar calendário\" envia só as datas acrescentadas e removidas", async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar(meetingList([meeting("2027-02-03", 1), meeting("2027-02-10", 2)]));
    await screen.findByText("Total de aulas selecionadas: 2");

    await user.click(dayButton(container, "2027-02-17"));
    await user.click(dayButton(container, "2027-02-10"));
    await user.click(dayButton(container, "2027-02-24"));
    await user.click(dayButton(container, "2027-02-24"));
    expect(screen.getByText("Total de aulas selecionadas: 2")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Aulas selecionadas" })).getAllByRole("listitem").map((i) => i.textContent)).toEqual([
      "Aula 01 — 03/02/2027",
      "Aula 02 — 17/02/2027",
    ]);

    await user.click(screen.getByRole("button", { name: "Salvar calendário" }));

    expect(await screen.findByText("Calendário salvo.")).toBeTruthy();
    expect(putCalls()).toEqual([
      {
        url: `/api/classes/${CLASS_ID}/meetings`,
        body: { planRevision: null, add: ["2027-02-17"], remove: ["2027-02-10"], resolutions: [] },
      },
    ]);
  });

  it("004/US4-6 004/FR-029 desmarcar aula com tópicos abre \"Esta aula tem tópicos planejados\" com as quatro escolhas", async () => {
    const user = userEvent.setup();
    const first = meeting("2027-02-03", 1, 1);
    const second = meeting("2027-02-10", 2, 3);
    const third = meeting("2027-02-17", 3);
    const other = topic("Classes e objetos", first.id, 1);
    const toMove = topic("Encapsulamento", second.id, 2);
    const toMerge = topic("Construtores", second.id, 3);
    const toArchive = topic("Revisão", second.id, 4);
    const toUnschedule = topic("Exercícios", null, 5);
    const meetings = [first, second, third];
    const { container } = renderCalendar(meetingList(meetings, 7), {
      plan: planEnvelope(meetings, [other, toMove, toMerge, toArchive, toUnschedule], 7),
    });
    await screen.findByText("Total de aulas selecionadas: 3");

    await user.click(dayButton(container, "2027-02-10"));
    const dialog = await screen.findByRole("dialog", { name: "Esta aula tem tópicos planejados" });
    expect(within(dialog).getAllByRole("group").map((group) => group.getAttribute("aria-label") ?? group.textContent)).toHaveLength(3);
    const moveGroup = within(dialog).getByRole("group", { name: "Encapsulamento" });
    for (const choice of ["Mover para outra aula", "Deixar sem data", "Juntar com outro tópico", "Arquivar"]) {
      expect(within(moveGroup).getByRole("radio", { name: choice })).toBeTruthy();
    }
    expect(within(dialog).queryByRole("group", { name: "Classes e objetos" })).toBeNull();

    // Without a choice for every topic nothing is unmarked.
    await user.click(within(dialog).getByRole("button", { name: "Desmarcar aula" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Escolha o que fazer com cada tópico.");

    await user.click(within(moveGroup).getByRole("radio", { name: "Mover para outra aula" }));
    const target = within(moveGroup).getByRole("combobox", { name: "Aula de destino" });
    expect(within(target).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Aula 01 — 03/02/2027",
      "Aula 02 — 17/02/2027",
    ]);
    await user.selectOptions(target, "2027-02-17");

    const mergeGroup = within(dialog).getByRole("group", { name: "Construtores" });
    await user.click(within(mergeGroup).getByRole("radio", { name: "Juntar com outro tópico" }));
    const into = within(mergeGroup).getByRole("combobox", { name: "Juntar com" });
    expect(within(into).getAllByRole("option").map((option) => option.textContent)).toEqual(["Classes e objetos", "Exercícios"]);
    await user.selectOptions(into, other.id);

    await user.click(within(within(dialog).getByRole("group", { name: "Revisão" })).getByRole("radio", { name: "Arquivar" }));
    await user.click(within(dialog).getByRole("button", { name: "Desmarcar aula" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Total de aulas selecionadas: 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar calendário" }));

    expect(await screen.findByText("Calendário salvo.")).toBeTruthy();
    expect(putCalls()[0]!.body).toEqual({
      planRevision: 7,
      add: [],
      remove: ["2027-02-10"],
      resolutions: [
        { topicId: toMove.id, action: "MOVE", meetingDate: "2027-02-17" },
        { topicId: toMerge.id, action: "MERGE", intoTopicId: other.id },
        { topicId: toArchive.id, action: "ARCHIVE" },
      ],
    });
  });

  it("004/US4-6 \"Deixar sem data\" e \"Cancelar\" mantém a aula marcada", async () => {
    const user = userEvent.setup();
    const busy = meeting("2027-02-10", 1, 1);
    const only = topic("Encapsulamento", busy.id, 1);
    const { container } = renderCalendar(meetingList([busy], 2), { plan: planEnvelope([busy], [only], 2) });
    await screen.findByText("Total de aulas selecionadas: 1");

    await user.click(dayButton(container, "2027-02-10"));
    let dialog = await screen.findByRole("dialog", { name: "Esta aula tem tópicos planejados" });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Total de aulas selecionadas: 1")).toBeTruthy();

    await user.click(dayButton(container, "2027-02-10"));
    dialog = await screen.findByRole("dialog", { name: "Esta aula tem tópicos planejados" });
    await user.click(within(dialog).getByRole("radio", { name: "Deixar sem data" }));
    await user.click(within(dialog).getByRole("button", { name: "Desmarcar aula" }));
    await user.click(screen.getByRole("button", { name: "Salvar calendário" }));
    await screen.findByText("Calendário salvo.");
    expect(putCalls()[0]!.body).toMatchObject({ resolutions: [{ topicId: only.id, action: "UNSCHEDULE" }] });
  });

  it("erro da API aparece com o texto do catálogo", async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar(meetingList([], 3));
    await screen.findByText("Total de aulas selecionadas: 0");
    fetchMock.mockResolvedValueOnce(apiError(409, "PLAN_REVISION_CONFLICT", "x"));

    await user.click(dayButton(container, "2027-02-03"));
    await user.click(screen.getByRole("button", { name: "Salvar calendário" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.",
    );
  });

  it("sem calendario.gerenciar: somente leitura", async () => {
    const { container } = renderCalendar(meetingList([meeting("2027-02-03", 1)]), { canEdit: false });
    await screen.findByText("Total de aulas selecionadas: 1");
    expect(screen.queryByRole("button", { name: "Salvar calendário" })).toBeNull();
    expect(dayButton(container, "2027-02-10").disabled).toBe(true);
    await expectNoA11yViolations(container);
  });
});
