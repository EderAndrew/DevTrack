import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { formatTime } from "@/lib/messages/dates";
import {
  FOCUS_WARNING_GUIDANCE,
  FOCUS_WARNING_PENDING,
  FOCUS_WARNING_TITLE,
  FocusViolationWarning,
  RETURN_TO_FULLSCREEN,
} from "./focus-violation-warning";

// 015/FR-011 (design-system/exam-mode.md, "ExamAlert e FocusViolationWarning"): the warning after an
// exit — what happened, the server's record and what to do — polite, never taking the focus.

const RECORDED_AT = "2026-10-01T17:32:00.000Z";

describe("015/FR-011 FocusViolationWarning", () => {
  it("015/US2-3 título, horário do servidor e o que fazer, em role=status, sem roubar o foco", async () => {
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    const { container } = render(<FocusViolationWarning recordedAt={RECORDED_AT} />);
    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain(FOCUS_WARNING_TITLE);
    expect(warning.textContent).toContain(`Este evento foi registrado às ${formatTime(RECORDED_AT)}.`);
    expect(formatTime(RECORDED_AT)).toMatch(/^\d{2}:\d{2}$/);
    expect(warning.textContent).toContain(FOCUS_WARNING_GUIDANCE);
    expect(document.activeElement).toBe(before);
    expect(warning.textContent).not.toMatch(/viola|fraude|cola|puni/i);
    await expectNoA11yViolations(container);
    before.remove();
  });

  it("015/US2-8 sem confirmação do servidor: \"Estamos registrando este evento\"", () => {
    render(<FocusViolationWarning recordedAt={null} />);
    expect(screen.getByRole("status").textContent).toContain(FOCUS_WARNING_PENDING);
  });

  it("015/US2-4 depois de sair da tela cheia oferece voltar a ela; \"Entendi\" fecha; teclado", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(<FocusViolationWarning recordedAt={RECORDED_AT} onReturnToFullscreen={onReturn} onDismiss={onDismiss} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: RETURN_TO_FULLSCREEN }));
    await user.keyboard("{Enter}");
    expect(onReturn).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard(" ");
    expect(onDismiss).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
