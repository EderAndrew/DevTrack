import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { HELP_POLL_MS } from "../hooks/use-work-help";
import { HELP_EXHAUSTED, HELP_NOTE, HELP_UNAVAILABLE, remainingAfterEach, remainingMessage } from "../schemas/work-help";
import { HelpChat } from "./help-chat";
import { helpItem, helpState, QUESTION_ID } from "./test-fixtures";

const ACTIVITY = "bbbbbbbb-0000-4000-8000-000000000001";
const HELP = `/api/me/activities/${ACTIVITY}/attempt/help`;
const OTHER_QUESTION = "cccccccc-0000-4000-8000-000000000002";
const QUESTIONS = [{ id: OTHER_QUESTION }, { id: QUESTION_ID }];
const pending = helpItem({ status: "REQUESTED", message: null, resolvedAt: null });

function setup(states: unknown[], post: () => Response = () => json(202, pending), canAsk = true) {
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) !== HELP) return apiError(404, "NOT_FOUND", "x");
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return post();
      }
      return json(200, states.length > 1 ? states.shift() : states[0]);
    }),
  );
  const view = renderWithProviders(<HelpChat activityId={ACTIVITY} questionId={QUESTION_ID} questions={QUESTIONS} canAsk={canAsk} />);
  return { ...view, posts, user: userEvent.setup({ advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined) }) };
}
const openChat = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Pedir ajuda" }));
  return screen.getByRole("dialog", { name: "Pedir ajuda à IA" });
};

describe("015/US3 ajuda da IA em forma de chat", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("015/US3-1 015/US3-2 o ícone com o contador, o envio com o painel aberto, o pendente e a resposta com as ajudas restantes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, posts, container } = setup([helpState(), helpState({ pending: true, items: [pending] }), helpState({ used: 1, items: [helpItem()] })]);
    expect(await screen.findByText("Ajudas restantes: 3 de 3")).toBeTruthy();
    await expectNoA11yViolations(container);
    const dialog = await openChat(user);
    expect(dialog.textContent).toContain(HELP_NOTE);
    expect(dialog.getAttribute("data-help-question-id")).toBe(QUESTION_ID);
    const field = within(dialog).getByRole("textbox", { name: /Sua pergunta sobre esta questão/ }) as HTMLTextAreaElement;
    expect(field).toBe(document.activeElement);
    expect(field.getAttribute("maxlength")).toBe("500");
    await user.type(field, "  Por onde começo?  ");
    await user.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(field.value).toBe(""));
    expect(posts).toEqual([{ questionId: QUESTION_ID, question: "Por onde começo?", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) }]);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(await within(dialog).findByText("A IA está preparando uma orientação…")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(HELP_POLL_MS * 2 + 10));
    expect(await within(dialog).findByText("Pense no que o enunciado pede antes de escrever.")).toBeTruthy();
    expect(within(dialog).getByText("Questão 2")).toBeTruthy();
    expect(within(dialog).getByText("Ainda restam 2 ajudas.")).toBeTruthy();
    expect(within(dialog).getByText("Ajudas restantes: 2 de 3")).toBeTruthy();
    await expectNoA11yViolations(document.body);
  });

  it("015/FR-015 cada resposta diz quantas ajudas restavam; só a orientação entregue conta", () => {
    const items = [helpItem(), helpItem({ status: "OUT_OF_SCOPE" }), helpItem(), helpItem({ status: "FAILED", message: null }), helpItem()];
    expect(remainingAfterEach(items, 3)).toEqual([2, 2, 1, 1, 0]);
    expect([2, 1, 0].map(remainingMessage)).toEqual(["Ainda restam 2 ajudas.", "Ainda resta 1 ajuda.", "Não restam mais ajudas."]);
  });

  it("015/US3-6 com as 3 ajudas usadas não há campo, há o aviso, e a conversa continua legível", async () => {
    const { user } = setup([helpState({ used: 3, items: [helpItem()] })]);
    const dialog = await openChat(user);
    expect(within(dialog).getByText(HELP_EXHAUSTED)).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).getByText("Pense no que o enunciado pede antes de escrever.")).toBeTruthy();
    expect(within(dialog).getByText("Ajudas restantes: 0 de 3")).toBeTruthy();
  });

  it.each([
    [503, "AI_HELP_UNAVAILABLE", HELP_UNAVAILABLE],
    [409, "HELP_PENDING", "Aguarde a orientação anterior."],
  ])("015/US3-9 recusa %i %s: a mensagem no painel, nada consumido", async (status, code, text) => {
    const { user } = setup([helpState()], () => apiError(status, code, "x"));
    const dialog = await openChat(user);
    await user.type(within(dialog).getByRole("textbox"), "Me ajuda?");
    await user.click(within(dialog).getByRole("button", { name: "Enviar" }));
    expect(await within(dialog).findByText(text)).toBeTruthy();
    expect(within(dialog).getByText("Ajudas restantes: 3 de 3")).toBeTruthy();
  });

  it("015/US3-11 sem ajuda no trabalho, o ícone não aparece", async () => {
    const { container } = setup([helpState({ allowance: 0 })]);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("015/FR-016 pergunta vazia é recusada antes de chegar à API", async () => {
    const { user, posts } = setup([helpState()]);
    const dialog = await openChat(user);
    await user.type(within(dialog).getByRole("textbox"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Enviar" }));
    expect(await within(dialog).findByText("Escreva a sua pergunta.")).toBeTruthy();
    expect(within(dialog).getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
    expect(posts).toEqual([]);
  });

  it("015/US3-3 fora do escopo e indisponível: o texto no chat, sem usar ajuda, e as ajudas restantes; nunca HTML", async () => {
    const { user } = setup([
      helpState({
        items: [
          helpItem({ id: "dddddddd-0000-4000-8000-000000000002", status: "OUT_OF_SCOPE", question: "<img src=x onerror=alert(1)>", message: "<script>alert(1)</script>" }),
          helpItem({ id: "dddddddd-0000-4000-8000-000000000003", status: "FAILED", message: null }),
        ],
      }),
    ]);
    const dialog = await openChat(user);
    expect(within(dialog).getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(within(dialog).getByText("Esta pergunta não usou uma ajuda.")).toBeTruthy();
    expect(within(dialog).getByText(HELP_UNAVAILABLE)).toBeTruthy();
    expect(within(dialog).getAllByText("Ainda restam 3 ajudas.")).toHaveLength(2);
    expect(dialog.querySelector("img, script")).toBeNull();
  });

  it("teclado: o foco fica no painel, Esc fecha e o foco volta ao ícone; no modo NORMAL, colar não é impedido", async () => {
    const { user } = setup([helpState()]);
    await screen.findByRole("button", { name: "Pedir ajuda" });
    await user.tab();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog");
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    fireEvent(within(dialog).getByRole("textbox"), paste);
    expect(paste.defaultPrevented).toBe(false);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pedir ajuda" }));
  });

  it("023/US7-3 quem não edita lê a conversa, sem campo", async () => {
    const { user } = setup([helpState({ used: 1, items: [helpItem()] })], undefined, false);
    const dialog = await openChat(user);
    expect(within(dialog).getByText("Pense no que o enunciado pede antes de escrever.")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });
});
