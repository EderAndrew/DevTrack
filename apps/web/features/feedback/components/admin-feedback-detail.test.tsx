import type { AdminFeedback, FeedbackStatus } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { Toaster } from "@/components/ui/toast";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { adminFeedbackKeys } from "../hooks/use-admin-feedbacks";
import { AdminFeedbackDetail } from "./admin-feedback-detail";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN = { id: "cccccccc-0000-4000-8000-000000000001", name: "Admin Um" };

const feedback = (overrides: Partial<AdminFeedback> = {}): AdminFeedback => ({
  id: ID,
  category: "PROBLEM",
  status: "RECEIVED",
  message: "A página travou ao salvar.\nDepois voltou.",
  originPath: "/minhas-atividades/abc-1",
  student: { id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Ana Souza", email: "ana@exemplo.com" },
  createdAt: "2026-10-25T12:00:00.000Z",
  statusChangedAt: "2026-10-25T12:00:00.000Z",
  history: [],
  ...overrides,
});

const changed = (from: FeedbackStatus, to: FeedbackStatus, base = feedback()) =>
  feedback({ ...base, status: to, history: [...base.history, { fromStatus: from, toStatus: to, changedBy: ADMIN, changedAt: "2026-10-25T13:00:00.000Z" }] });

function setup(gets: AdminFeedback[], post?: () => Response, canChange = true) {
  const posts: unknown[] = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/feedbacks/${ID}` && (init?.method ?? "GET") === "GET") return json(200, gets[Math.min(reads++, gets.length - 1)]);
      if (url === `/api/feedbacks/${ID}/status` && init?.method === "POST" && post) {
        posts.push(JSON.parse(String(init.body)));
        return post();
      }
      return apiError(404, "NOT_FOUND", "x");
    }),
  );
  const view = renderWithProviders(
    <Toaster>
      <AdminFeedbackDetail id={ID} canChange={canChange} />
    </Toaster>,
  );
  return { ...view, posts, user: userEvent.setup() };
}

describe("020/US2 detalhe de um feedback para o ADMIN", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("020/US2-3 mostra a mensagem inteira como texto, nome e e-mail, a tela e o envio; histórico vazio", async () => {
    const { container } = setup([feedback()]);
    const message = await screen.findByText(/A página travou ao salvar\./);
    expect(message.textContent).toBe("A página travou ao salvar.\nDepois voltou.");
    expect(screen.getByText("Ana Souza · ana@exemplo.com")).toBeTruthy();
    expect(screen.getByText("/minhas-atividades/abc-1").tagName).toBe("CODE");
    expect(screen.getByText("Sem mudanças ainda.")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("020/US2-3 histórico do mais antigo ao mais novo com o nome do ADMIN; sem tela → Não registrada", async () => {
    setup([changed("IN_REVIEW", "RESOLVED", changed("RECEIVED", "IN_REVIEW", feedback({ originPath: null })))]);
    const history = within(await screen.findByRole("region", { name: "Histórico" }));
    expect(history.getAllByRole("listitem").map((li) => li.textContent?.replace(/ · [^·]+$/, ""))).toEqual([
      "Recebido → Em análise · Admin Um",
      "Em análise → Resolvido · Admin Um",
    ]);
    expect(screen.getByText("Não registrada")).toBeTruthy();
  });

  it("020/US2-4 só os botões permitidos; a mudança mostra o aviso, a nova situação e o histórico, e o contador fica velho", async () => {
    const updated = changed("RECEIVED", "IN_REVIEW");
    const { user, posts, queryClient } = setup([feedback()], () => json(200, updated));
    queryClient.setQueryData(adminFeedbackKeys.summary, { received: 3 });
    const actions = within(await screen.findByRole("region", { name: "Mudar situação" }));
    expect(actions.getAllByRole("button").map((button) => button.textContent)).toEqual(["Em análise", "Resolvido", "Arquivar"]);

    await user.click(actions.getByRole("button", { name: "Em análise" }));
    expect(await screen.findByText("Situação alterada para Em análise.")).toBeTruthy();
    expect(posts).toEqual([{ status: "IN_REVIEW" }]);
    expect(within(screen.getByRole("region", { name: "Mudar situação" })).getAllByRole("button").map((button) => button.textContent)).toEqual(["Resolvido", "Arquivar"]);
    expect(within(screen.getByRole("region", { name: "Histórico" })).getByRole("listitem").textContent).toContain("Recebido → Em análise · Admin Um");
    expect(queryClient.getQueryState(adminFeedbackKeys.summary)?.isInvalidated).toBe(true);
  });

  it("020/US2-5 RESOLVED e ARCHIVED oferecem só Reabrir", async () => {
    setup([feedback({ status: "ARCHIVED" })]);
    const actions = within(await screen.findByRole("region", { name: "Mudar situação" }));
    expect(actions.getAllByRole("button").map((button) => button.textContent)).toEqual(["Reabrir"]);
  });

  it("020/US2-6 409: avisa que outra pessoa mudou e recarrega o feedback", async () => {
    const { user } = setup([feedback(), changed("RECEIVED", "RESOLVED")], () => apiError(409, "INVALID_STATE_TRANSITION", "x"));
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Outra pessoa já mudou esta situação. Atualizamos a página.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Reabrir" })).toBeTruthy());
  });

  it("020/US2-3 sem feedbacks.alterar_situacao não há botões; id inexistente → mensagem de não encontrado", async () => {
    setup([feedback()], undefined, false);
    await screen.findByText("Sem mudanças ainda.");
    expect(screen.queryByRole("region", { name: "Mudar situação" })).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => apiError(404, "NOT_FOUND", "x")));
    renderWithProviders(
      <Toaster>
        <AdminFeedbackDetail id="aaaaaaaa-0000-4000-8000-000000000009" canChange />
      </Toaster>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe("Recurso não encontrado.");
  });

  it("020/SC-007 mensagem com HTML e URL aparece como texto, sem link", async () => {
    setup([feedback({ message: "<script>alert(1)</script> <a href=x>clique</a> https://exemplo.com" })]);
    const message = await screen.findByText(/<script>/);
    expect(message.textContent).toBe("<script>alert(1)</script> <a href=x>clique</a> https://exemplo.com");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
