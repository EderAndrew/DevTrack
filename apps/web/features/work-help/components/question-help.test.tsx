import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { HELP_POLL_MS } from "../hooks/use-work-help";
import { HELP_EXHAUSTED, HELP_UNAVAILABLE } from "../schemas/work-help";
import { QuestionHelp } from "./question-help";
import { helpItem, helpState, QUESTION_ID } from "./test-fixtures";

const ACTIVITY = "bbbbbbbb-0000-4000-8000-000000000001";
const HELP = `/api/me/activities/${ACTIVITY}/attempt/help`;
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
  const view = renderWithProviders(<QuestionHelp activityId={ACTIVITY} questionId={QUESTION_ID} highlight={undefined} canAsk={canAsk} />);
  return { ...view, posts, user: userEvent.setup({ advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined) }) };
}

describe("015/US3 \"Pedir ajuda\" numa questão", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("015/US3-1 015/US3-2 o contador, o envio, o pendente anunciado e a orientação; o contador cai para 2 de 3", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, posts, container } = setup([helpState(), helpState({ pending: true, items: [pending] }), helpState({ used: 1, items: [helpItem()] })]);
    expect(await screen.findByText("Ajudas restantes: 3 de 3")).toBeTruthy();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    await user.type(screen.getByRole("textbox"), "Por onde começo?");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual([{ questionId: QUESTION_ID, question: "Por onde começo?", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) }]);
    expect(await screen.findByText("A IA está preparando uma orientação…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pedir ajuda" })).toBe(document.activeElement);
    await act(async () => vi.advanceTimersByTimeAsync(HELP_POLL_MS * 2 + 10));
    expect(await screen.findByText("Pense no que o enunciado pede antes de escrever.")).toBeTruthy();
    expect(screen.getByText("Ajudas restantes: 2 de 3")).toBeTruthy();
  });

  it("015/US3-6 com as 3 ajudas usadas, \"Pedir ajuda\" fica indisponível com o aviso", async () => {
    setup([helpState({ used: 3, items: [helpItem()] })]);
    expect(await screen.findByText(HELP_EXHAUSTED)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pedir ajuda" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Ajudas restantes: 0 de 3")).toBeTruthy();
  });

  it.each([
    [503, "AI_HELP_UNAVAILABLE", HELP_UNAVAILABLE],
    [409, "HELP_PENDING", "Aguarde a orientação anterior."],
  ])("015/US3-9 recusa %i %s: a mensagem no diálogo, nada consumido", async (status, code, text) => {
    const { user } = setup([helpState()], () => apiError(status, code, "x"));
    await user.click(await screen.findByRole("button", { name: "Pedir ajuda" }));
    await user.type(screen.getByRole("textbox"), "Me ajuda?");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText("Ajudas restantes: 3 de 3")).toBeTruthy();
  });

  it("015/US3-11 sem ajuda no trabalho, ou depois da entrega sem pedidos, nada aparece", async () => {
    const { container } = setup([helpState({ allowance: 0 })]);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    vi.unstubAllGlobals();
    const closed = setup([helpState()], undefined, false);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(closed.container.textContent).toBe("");
  });

  it("015/FR-022 depois da entrega, as orientações recebidas continuam visíveis, sem \"Pedir ajuda\"; texto nunca vira HTML", async () => {
    const { container } = setup([helpState({ used: 1, items: [helpItem({ question: "<img src=x onerror=alert(1)>", message: "<script>alert(1)</script>" })] })], undefined, false);
    expect(await screen.findByText("<script>alert(1)</script>")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pedir ajuda" })).toBeNull();
    expect(container.querySelector("img, script")).toBeNull();
  });
});
