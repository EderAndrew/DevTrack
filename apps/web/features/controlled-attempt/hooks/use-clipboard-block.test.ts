import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipboardBlock } from "./use-clipboard-block";

// 015/FR-013a–FR-013c (research F6): paste, drop, copy, cut and drag refused anywhere in the page,
// one event per gesture with the question, nothing read from the clipboard; only when enabled.

describe("015/FR-013a 015/FR-013b bloqueio de copiar e colar", () => {
  let field: HTMLTextAreaElement;
  let statement: HTMLParagraphElement;

  beforeEach(() => {
    const question = document.createElement("article");
    question.dataset.questionId = "q1";
    field = document.createElement("textarea");
    statement = document.createElement("p");
    statement.textContent = "Enunciado";
    question.append(statement, field);
    document.body.append(question);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const fire = (target: EventTarget, event: Event) => {
    act(() => {
      target.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };
  const gesture = (type: string) => new Event(type, { bubbles: true, cancelable: true });

  it("015/US2-10 colar e soltar no campo: nada entra, um evento por gesto com a questão, e a mensagem de colagem", () => {
    const onBlocked = vi.fn();
    const { result } = renderHook(() => useClipboardBlock({ enabled: true, onBlocked }));
    const paste = gesture("paste");
    const clipboardRead = vi.fn();
    Object.defineProperty(paste, "clipboardData", { get: clipboardRead });
    expect(fire(field, paste)).toBe(true);
    expect(fire(field, gesture("drop"))).toBe(true);
    expect(onBlocked.mock.calls).toEqual([
      ["PASTE_BLOCKED", "q1"],
      ["DROP_BLOCKED", "q1"],
    ]);
    expect(clipboardRead).not.toHaveBeenCalled();
    expect(result.current.notice).toMatchObject({ kind: "PASTE", questionId: "q1" });
  });

  it("015/US2-10 colagem do teclado do celular (beforeinput insertFromPaste) também é bloqueada", () => {
    const onBlocked = vi.fn();
    renderHook(() => useClipboardBlock({ enabled: true, onBlocked }));
    expect(fire(field, new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste" }))).toBe(true);
    expect(fire(field, new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "a" }))).toBe(false);
    expect(onBlocked.mock.calls).toEqual([["PASTE_BLOCKED", "q1"]]);
  });

  it("015/US2-11 copiar, recortar e arrastar o enunciado ou a resposta: bloqueados e registrados", () => {
    const onBlocked = vi.fn();
    const { result } = renderHook(() => useClipboardBlock({ enabled: true, onBlocked }));
    expect(fire(statement, gesture("copy"))).toBe(true);
    expect(fire(field, gesture("cut"))).toBe(true);
    expect(fire(statement, gesture("dragstart"))).toBe(true);
    expect(fire(document.body, gesture("copy"))).toBe(true);
    expect(onBlocked.mock.calls).toEqual([
      ["COPY_BLOCKED", "q1"],
      ["CUT_BLOCKED", "q1"],
      ["COPY_BLOCKED", "q1"],
      ["COPY_BLOCKED", null],
    ]);
    expect(result.current.notice).toMatchObject({ kind: "COPY", questionId: null, key: 4 });
    act(() => result.current.dismiss());
    expect(result.current.notice).toBeNull();
  });

  it("015/US2-12 digitar e atalhos que não colam seguem normais", () => {
    const onBlocked = vi.fn();
    renderHook(() => useClipboardBlock({ enabled: true, onBlocked }));
    expect(fire(field, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }))).toBe(false);
    expect(fire(field, new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }))).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("015/US2-9 desligado (modo NORMAL) nada é bloqueado; ao desligar, os ouvintes saem", () => {
    const onBlocked = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useClipboardBlock({ enabled, onBlocked }), { initialProps: { enabled: false } });
    expect(fire(field, gesture("paste"))).toBe(false);
    rerender({ enabled: true });
    expect(fire(field, gesture("paste"))).toBe(true);
    rerender({ enabled: false });
    expect(fire(field, gesture("copy"))).toBe(false);
    expect(onBlocked).toHaveBeenCalledOnce();
  });
});
