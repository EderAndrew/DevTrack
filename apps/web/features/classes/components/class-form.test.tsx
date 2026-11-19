import type { ClassView } from "@repo/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ClassForm } from "./class-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const CLASS: ClassView = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2º semestre",
  description: null,
  status: "ACTIVE",
  activeStudentCount: 0,
  subject: { id: "33333333-3333-4333-8333-333333333333", name: "Programação Orientada a Objetos" },
  startsOn: null,
  endsOn: null,
  plannable: false,
  planStatus: null,
  cohort: { id: "99999999-9999-4999-8999-999999999999", name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "2º semestre" },
  ownStatus: "ACTIVE",
  effectiveStatus: "ACTIVE",
  canChangeStatus: false,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

const sentBody = (call: number, fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as unknown;

describe("004/US1-4 004/US1-5 ClassForm — o calendário da disciplina da turma (027/FR-019)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("só as datas: vem preenchido, envia PATCH só com elas e volta para a disciplina da turma", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...CLASS, startsOn: "2026-08-03", endsOn: "2026-12-11", plannable: true }));
    const { container } = renderWithProviders(<ClassForm initial={{ ...CLASS, startsOn: "2026-08-01", endsOn: "2026-12-01" }} />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(screen.queryByLabelText("Disciplina")).toBeNull();
    const start = screen.getByLabelText<HTMLInputElement>("Data de início");
    expect(start.value).toBe("2026-08-01");
    await user.clear(start);
    await user.type(start, "2026-08-03");
    const end = screen.getByLabelText<HTMLInputElement>("Data de término");
    await user.clear(end);
    await user.type(end, "2026-12-11");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS.id}`));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS.id}`);
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("PATCH");
    expect(sentBody(0, fetchMock)).toEqual({ startsOn: "2026-08-03", endsOn: "2026-12-11" });
    await expectNoA11yViolations(container);
  });

  it("limpar as duas datas envia null nas duas", async () => {
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    renderWithProviders(<ClassForm initial={{ ...CLASS, startsOn: "2026-08-01", endsOn: "2026-12-01" }} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Data de início"));
    await user.clear(screen.getByLabelText("Data de término"));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody(0, fetchMock)).toEqual({ startsOn: null, endsOn: null });
  });

  it("004/US1-5 uma data só ou término antes do início: erro junto ao campo, sem chamar a API", async () => {
    renderWithProviders(<ClassForm initial={CLASS} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Data de início"), "2026-08-03");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findAllByText("Informe as datas de início e de término, ou deixe as duas em branco.")).not.toHaveLength(0);
    expectFieldErrorLinked(screen.getByLabelText("Data de término"));

    await user.type(screen.getByLabelText("Data de término"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findAllByText("A data de término não pode ser anterior à de início.")).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro da API aparece no resumo", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "MEETINGS_OUTSIDE_PERIOD", "x"));
    renderWithProviders(<ClassForm initial={{ ...CLASS, startsOn: "2026-08-01", endsOn: "2026-12-01" }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("heading", { name: "Não foi possível salvar" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("004/SC-012 ordem de tabulação: datas, salvar e cancelar", async () => {
    renderWithProviders(<ClassForm initial={CLASS} />);
    const user = userEvent.setup();
    await expectTabOrder(user, [
      screen.getByLabelText("Data de início"),
      screen.getByLabelText("Data de término"),
      screen.getByRole("button", { name: "Salvar alterações" }),
      screen.getByRole("link", { name: "Cancelar" }),
    ]);
  });
});
