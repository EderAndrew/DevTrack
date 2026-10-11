import type { StudentPause } from "@repo/contracts";
import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "@/features/activities/components/test-fixtures";
import { formatLongDateTime, formatTime } from "@/lib/messages/dates";
import { expectNoA11yViolations } from "../../../test/a11y";
import { tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ATTENDANCE_POLL_MS, PAUSED_TEXT, PAUSED_TITLE, RESUME, RESUME_CONTROLLED, RETURN_RELEASED } from "../schemas/attendance";
import { PausedNotice } from "./paused-notice";

const ACTIVITY = "22222222-2222-4222-8222-222222222222";
const PAUSE_PATH = `/api/me/activities/${ACTIVITY}/attempt/pause`;
const DEADLINE = "2026-10-02T17:00:00.000Z";
const PAUSE: StudentPause = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  initiatedBy: "STUDENT",
  reason: "WATER",
  note: null,
  startedAt: "2026-10-02T13:42:00.000Z",
  endedAt: null,
};

/** The poll answers the open pause `openPolls` times, then nothing open (the teacher released it). */
function setup({ pause = PAUSE, openPolls = Infinity, resumeLabel }: { pause?: StudentPause; openPolls?: number; resumeLabel?: string } = {}) {
  let polls = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    if (String(input) !== PAUSE_PATH) return json(404, { statusCode: 404, code: "NOT_FOUND", message: "x" });
    polls += 1;
    return json(200, { pause: polls <= openPolls ? pause : null });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onResume = vi.fn();
  const view = renderWithProviders(<PausedNotice activityId={ACTIVITY} pause={pause} deadline={DEADLINE} onResume={onResume} resumeLabel={resumeLabel} />);
  return { ...view, onResume, polls: () => polls, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) };
}

describe("016/US3 PausedNotice — a tentativa pausada", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    focusManager.setFocused(true);
  });
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("016/US3-3 016/FR-013 role=\"status\" com o título, o texto, o motivo, a saída e o prazo; nada de questões nem \"Retomar\"", async () => {
    setup();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(PAUSED_TITLE);
    expect(status.textContent).toContain(PAUSED_TEXT);
    expect(status.textContent).toContain("Beber água");
    expect(status.textContent).toContain(`Saída às ${formatTime(PAUSE.startedAt)}`);
    expect(status.textContent).toContain(`Prazo: ${formatLongDateTime(DEADLINE)}`);
    expect(screen.queryByRole("button", { name: RESUME })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
  });

  it("016/FR-016 a pausa do professor aparece como \"Pausado pelo professor\"; a nota de \"Outro\" é texto", () => {
    setup({ pause: { ...PAUSE, initiatedBy: "TEACHER", reason: "TEACHER" } });
    expect(screen.getByRole("status").textContent).toContain("Pausado pelo professor");
  });

  it("016/US3-5 016/FR-014 a sondagem a cada 5 s mostra \"Retorno liberado\" e \"Retomar\" quando o professor libera", async () => {
    const { user, onResume, polls } = setup({ openPolls: 1 });
    await waitFor(() => expect(polls()).toBe(1));
    expect(screen.queryByText(RETURN_RELEASED)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(ATTENDANCE_POLL_MS));
    expect(await screen.findByText(RETURN_RELEASED)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(RETURN_RELEASED);
    await user.click(screen.getByRole("button", { name: RESUME }));
    expect(onResume).toHaveBeenCalledOnce();
    // Released: the polling stops.
    const after = polls();
    await act(() => vi.advanceTimersByTimeAsync(3 * ATTENDANCE_POLL_MS));
    expect(polls()).toBe(after);
  });

  it("016/US3-6 016/FR-017 no modo controlado o retorno é \"Retomar em modo controlado\", por gesto do aluno", async () => {
    const { user, onResume } = setup({ openPolls: 0, resumeLabel: RESUME_CONTROLLED });
    await user.click(await screen.findByRole("button", { name: RESUME_CONTROLLED }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("016/FR-023 axe e teclado: Tab até \"Retomar\" e Enter retoma", async () => {
    const { container, user, onResume } = setup({ openPolls: 0 });
    const resume = await screen.findByRole("button", { name: RESUME });
    await expectNoA11yViolations(container);
    await tabTo(user, resume);
    await user.keyboard("{Enter}");
    expect(onResume).toHaveBeenCalledOnce();
  });
});
