import type { CohortDetail } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { AddStudentDialog } from "./add-student";
import { CohortPage } from "./cohort-page";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string) => json(status, { statusCode: status, code, message: "texto da API" });

const COHORT_ID = "00000000-0000-4000-8000-000000000001";
const STUDENT_ID = "00000000-0000-4000-8000-000000000009";
const enrollment = {
  id: "00000000-0000-4000-8000-000000000010",
  student: { userId: STUDENT_ID, name: "Bruna", email: "bruna@exemplo.com" },
  status: "ACTIVE",
  source: "DIRECT",
  enrolledAt: "2026-11-18T12:00:00.000Z",
  removedAt: null,
};
const invitation = {
  id: "00000000-0000-4000-8000-000000000011",
  email: "ana@exemplo.com",
  status: "PENDING",
  expiresAt: "2026-11-25T12:00:00.000Z",
  sendCount: 1,
  lastSentAt: "2026-11-18T12:00:00.000Z",
  delivery: "SENT",
  deliveryIssue: null,
  createdAt: "2026-11-18T12:00:00.000Z",
};

describe("027/US2 AddStudentDialog — e-mail, consulta e inclusão direta ou convite (FR-034, FR-032)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = async (props: { canInclude?: boolean; canInvite?: boolean } = {}) => {
    renderWithProviders(<AddStudentDialog cohortId={COHORT_ID} canInclude={props.canInclude ?? true} canInvite={props.canInvite ?? true} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Adicionar aluno" }));
    return user;
  };

  it("027/US2-7 aluno com conta: \"Bruna · já tem conta\" e \"Incluir na turma\" → \"Aluno incluído na turma.\"; o e-mail vai no corpo, nunca na URL", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { found: true, studentUserId: STUDENT_ID, name: "Bruna", alreadyEnrolled: false }))
      .mockResolvedValueOnce(json(201, enrollment));
    const user = await open();
    await expectNoA11yViolations(screen.getByRole("dialog"));
    await user.type(screen.getByLabelText(/^E-mail/), "bruna@exemplo.com");
    await user.keyboard("{Enter}");

    await screen.findByRole("button", { name: "Incluir na turma" });
    const status = within(screen.getByRole("dialog")).getAllByRole("status")[0]!;
    expect(status.textContent).toBe("Bruna · já tem conta");
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/cohorts/${COHORT_ID}/student-lookup`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ email: "bruna@exemplo.com" });

    await user.click(screen.getByRole("button", { name: "Incluir na turma" }));
    expect(await screen.findByText("Aluno incluído na turma.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/cohorts/${COHORT_ID}/enrollments`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ email: "bruna@exemplo.com" });
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain("bruna");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("027/US2-9 aluno já na turma: \"Esse aluno já está na turma.\" e nenhum botão de incluir ou convidar", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { found: true, studentUserId: STUDENT_ID, name: "Bruna", alreadyEnrolled: true }));
    const user = await open();
    await user.type(screen.getByLabelText(/^E-mail/), "bruna@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Esse aluno já está na turma.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Incluir na turma" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar convite" })).toBeNull();
  });

  it("027/US2-8 e-mail sem conta de aluno: \"Enviar convite\" → \"Convite enviado.\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { found: false })).mockResolvedValueOnce(json(201, invitation));
    const user = await open();
    await user.type(screen.getByLabelText(/^E-mail/), "ana@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Esse e-mail ainda não tem conta de aluno.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));
    expect(await screen.findByText("Convite enviado.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/cohorts/${COHORT_ID}/invitations`);
  });

  it("a recusa da API aparece no campo; sem incluir_aluno o envio é o convite direto", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "INVITATION_ALREADY_PENDING"));
    const user = await open({ canInclude: false });
    await user.type(screen.getByLabelText(/^E-mail/), "ana@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));
    expect((await screen.findAllByText(/convite pendente/i)).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/cohorts/${COHORT_ID}/invitations`);
  });

  it("027/FR-033 o nome devolvido pela consulta aparece como texto", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { found: true, studentUserId: STUDENT_ID, name: "<b>Bruna</b>", alreadyEnrolled: false }));
    const user = await open();
    await user.type(screen.getByLabelText(/^E-mail/), "bruna@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("<b>Bruna</b>")).toBeTruthy();
    expect(screen.getByRole("dialog").querySelector("b")).toBeNull();
  });
});

describe("027/US2 CohortPage — abas Alunos e Convites da turma do gestor (FR-007, FR-011)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const detail: CohortDetail = {
    id: COHORT_ID,
    name: "ADS 3NA",
    code: "ADS-3NA",
    academicYear: 2026,
    period: null,
    description: null,
    status: "ACTIVE",
    activeEnrollmentCount: 1,
    classCount: 0,
    createdAt: "2026-11-18T12:00:00.000Z",
    updatedAt: "2026-11-18T12:00:00.000Z",
    classes: [],
  };

  it("Alunos lista nome, e-mail, matrícula e entrada; Convites lista os convites da turma com a entrega", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/enrollments")) return json(200, { items: [enrollment], nextCursor: null });
      if (url.includes("/invitations")) return json(200, { items: [invitation], nextCursor: null });
      return json(200, detail);
    });
    const { container } = renderWithProviders(
      <CohortPage id={COHORT_ID} canEdit canChangeStatus canInvite canInclude canSeeStudents canResend canCancel />,
    );
    const user = userEvent.setup();

    const row = (await screen.findByText("bruna@exemplo.com")).closest("tr")!;
    for (const text of ["Bruna", "Ativa", "Inclusão direta"]) expect(within(row).getByText(text)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adicionar aluno" })).toBeTruthy();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("tab", { name: "Convites" }));
    expect(await screen.findByText("ana@exemplo.com")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === `/api/cohorts/${COHORT_ID}/invitations?status=PENDING`)).toBe(true);
    expect(screen.getByRole("button", { name: /Reenviar/ })).toBeTruthy();
  });

  it("turma inativa não oferece Adicionar aluno", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/enrollments") ? json(200, { items: [], nextCursor: null }) : json(200, { ...detail, status: "INACTIVE" }),
    );
    renderWithProviders(<CohortPage id={COHORT_ID} canEdit canChangeStatus canInvite canInclude canSeeStudents />);
    expect(await screen.findByText("Nenhum aluno na turma ainda.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar aluno" })).toBeNull();
  });
});
