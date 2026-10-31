import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { QuestionHelp } from "./question-help";
import { helpItem, helpState, QUESTION_ID } from "./test-fixtures";

const ACTIVITY = "bbbbbbbb-0000-4000-8000-000000000001";
const HELP = `/api/me/activities/${ACTIVITY}/attempt/help`;

function setup(state: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => (String(input) === HELP ? json(200, state) : apiError(404, "NOT_FOUND", "x"))),
  );
  return renderWithProviders(<QuestionHelp activityId={ACTIVITY} questionId={QUESTION_ID} highlight={undefined} />);
}

describe("015/FR-022 orientações sob a questão depois da entrega", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("015/FR-022 as orientações recebidas continuam visíveis, sem pedir ajuda; texto nunca vira HTML", async () => {
    const { container } = setup(helpState({ used: 1, items: [helpItem({ question: "<img src=x onerror=alert(1)>", message: "<script>alert(1)</script>" })] }));
    expect(await screen.findByText("<script>alert(1)</script>")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pedir ajuda" })).toBeNull();
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("015/US3-11 sem pedidos nesta questão, nada aparece", async () => {
    const { container } = setup(helpState());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
