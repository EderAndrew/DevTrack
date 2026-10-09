import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTENDANCE_POLL_MS } from "@/features/attendance/schemas/attendance";
import { makeTestQueryClient } from "../../../test/render";
import { useStudentActivities, useStudentDashboard } from "./use-student-activities";

// 016/FR-009, research M8: a late student marked present sees the work appear without reloading:
// "Minhas atividades" and the dashboard are read again every 5 s, only while the page is visible.

const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const DASHBOARD = { counts: { pending: 0, inProgress: 0, overdue: 0, completed: 0 }, next: [], overdueOpen: [], ranking: [] };
const PAGE = { items: [], nextCursor: null };

describe("016/FR-009 lista e dashboard do aluno sondam a cada 5 s com a página visível", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={makeTestQueryClient()}>{children}</QueryClientProvider>;
  const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(path)).length;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url) => reply(String(url).includes("dashboard") ? DASHBOARD : PAGE));
    vi.stubGlobal("fetch", fetchMock);
    focusManager.setFocused(true);
  });
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("016/FR-009 o dashboard e \"Minhas atividades\" são lidos de novo a cada ATTENDANCE_POLL_MS", async () => {
    renderHook(() => [useStudentDashboard(), useStudentActivities({ status: null, type: null })], { wrapper });
    await vi.waitFor(() => expect(callsTo("/api/me/dashboard")).toBe(1));
    await vi.waitFor(() => expect(callsTo("/api/me/activities")).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(ATTENDANCE_POLL_MS));
    await vi.waitFor(() => expect(callsTo("/api/me/dashboard")).toBe(2));
    await vi.waitFor(() => expect(callsTo("/api/me/activities")).toBe(2));
  });

  it("016/FR-009 com a página escondida não há sondagem", async () => {
    renderHook(() => useStudentDashboard(), { wrapper });
    await vi.waitFor(() => expect(callsTo("/api/me/dashboard")).toBe(1));
    act(() => focusManager.setFocused(false));
    await act(() => vi.advanceTimersByTimeAsync(3 * ATTENDANCE_POLL_MS));
    expect(callsTo("/api/me/dashboard")).toBe(1);
  });
});
