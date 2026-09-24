import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { documentView } from "../../syllabus/components/test-fixtures";
import { json } from "../../subjects/components/test-fixtures";
import { PlanSyllabusPicker } from "./plan-syllabus-picker";
import { CLASS_ID, envelope, planView, topicView, uuid } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000999";

describe("004/US5 PlanSyllabusPicker — ementa usada pela turma (FR-031, FR-042)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const v1 = documentView(SUBJECT_ID, { version: 1, confirmedRevision: { id: uuid(), number: 1 } });
  const v2 = documentView(SUBJECT_ID, { version: 2, confirmedRevision: { id: uuid(), number: 2 } });
  const v3 = documentView(SUBJECT_ID, { version: 3, confirmedRevision: null });

  const puts = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init!.body)));

  function serve(plan: ReturnType<typeof planView> | null, saved: ReturnType<typeof planView>) {
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "PUT") return json(200, saved);
      if (String(url).endsWith("/syllabus-documents")) return json(200, { items: [v3, v2, v1] });
      return json(200, envelope(plan));
    });
  }

  it("sem ementa: escolhe entre as versões confirmadas e usa sem pedir confirmação", async () => {
    const user = userEvent.setup();
    serve(null, planView({ revision: 1 }));
    const { container } = renderWithProviders(<PlanSyllabusPicker classId={CLASS_ID} subjectId={SUBJECT_ID} canEdit />);

    expect(await screen.findByText(/A turma ainda não usa uma ementa\./)).toBeTruthy();
    const select = (await screen.findByLabelText("Versão confirmada")) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Versão 2 — revisão 2", "Versão 1 — revisão 1"]);
    await expectNoA11yViolations(container);

    await user.selectOptions(select, "Versão 1 — revisão 1");
    await user.click(screen.getByRole("button", { name: "Usar esta versão" }));

    expect(await screen.findByText("A turma agora usa esta ementa.")).toBeTruthy();
    expect(puts()).toEqual([{ planRevision: null, revisionId: v1.confirmedRevision!.id }]);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === `/api/classes/${CLASS_ID}/plan/syllabus`)).toBe(true);
  });

  it("004/FR-042 trocar de versão pede confirmação e avisa dos itens fora da nova versão", async () => {
    const user = userEvent.setup();
    const current = planView({
      revision: 6,
      syllabus: { subjectId: SUBJECT_ID, documentId: v1.id, documentVersion: 1, revisionId: v1.confirmedRevision!.id, revisionNumber: 1 },
    });
    const outside = { id: uuid(), text: "Construtores", outsideRevision: true };
    serve(current, planView({ revision: 7, topics: [topicView("Construtores", { items: [outside] })] }));
    renderWithProviders(<PlanSyllabusPicker classId={CLASS_ID} subjectId={SUBJECT_ID} canEdit />);

    expect(await screen.findByText("Versão 1, revisão 1.")).toBeTruthy();
    const button = await screen.findByRole("button", { name: "Usar esta versão" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText("Versão confirmada"), "Versão 2 — revisão 2");
    await user.click(button);

    const confirm = await screen.findByRole("alertdialog", { name: "Trocar a ementa usada pela turma?" });
    expect(within(confirm).getByText(/Os tópicos são mantidos\./)).toBeTruthy();
    expect(puts()).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Trocar ementa" }));

    expect(await screen.findByText("Ementa da turma trocada. 1 item de tópico não existe nesta versão.")).toBeTruthy();
    await waitFor(() => expect(puts()).toEqual([{ planRevision: 6, revisionId: v2.confirmedRevision!.id }]));
  });

  it("004/US7-6 planejamento arquivado: a ementa usada não pode mais ser trocada", async () => {
    serve(planView({ status: "ARCHIVED" }), planView());
    renderWithProviders(<PlanSyllabusPicker classId={CLASS_ID} subjectId={SUBJECT_ID} canEdit />);
    expect(await screen.findByText("Versão 2, revisão 1.")).toBeTruthy();
    expect(screen.queryByLabelText("Versão confirmada")).toBeNull();
  });

  it("sem planejamento.editar: só mostra a ementa usada", async () => {
    serve(planView(), planView());
    renderWithProviders(<PlanSyllabusPicker classId={CLASS_ID} subjectId={SUBJECT_ID} canEdit={false} />);
    expect(await screen.findByText("Versão 2, revisão 1.")).toBeTruthy();
    expect(screen.queryByLabelText("Versão confirmada")).toBeNull();
  });
});
