"use client";

import type { ClientIntegrityEventType } from "@repo/contracts";
import { useEffect, useRef, useState } from "react";

// Copy, cut, paste and drop blocked in a CONTROLLED attempt (015/FR-013a–FR-013c, research F6):
// document listeners in the capture phase cover every field and text of the page (the code
// editor refuses them too, `blockClipboard`). Nothing is ever read from the clipboard.

export const PASTE_BLOCKED_MESSAGE = "Colar não é permitido neste trabalho. Digite a sua resposta.";
export const COPY_BLOCKED_MESSAGE = "Copiar não é permitido neste trabalho.";

/** Mobile keyboards paste through `beforeinput` without a `paste` event. */
const PASTE_INPUTS = new Set(["insertFromPaste", "insertFromDrop", "insertFromPasteAsQuotation"]);

const GESTURES: Record<string, ClientIntegrityEventType> = {
  paste: "PASTE_BLOCKED",
  drop: "DROP_BLOCKED",
  copy: "COPY_BLOCKED",
  cut: "CUT_BLOCKED",
  // Dragging text out of the page copies it.
  dragstart: "COPY_BLOCKED",
};

export interface ClipboardNotice {
  /** PASTE for paste and drop; COPY for copy, cut and drag. */
  kind: "PASTE" | "COPY";
  /** The question whose area the gesture happened in (`data-question-id`), if any. */
  questionId: string | null;
  /** Changes on every gesture, so the message is announced again. */
  key: number;
}

/** The question of the element the gesture happened in. */
const questionOf = (target: EventTarget | null): string | null =>
  target instanceof Element ? (target.closest<HTMLElement>("[data-question-id]")?.dataset.questionId ?? null) : null;

/**
 * Blocks the gestures while `enabled` and reports each one once (`onBlocked`); the last one is the
 * `notice` the page shows next to the field. A paste the browser already stopped fires no
 * `beforeinput`, so a gesture is never counted twice.
 */
export function useClipboardBlock({
  enabled,
  onBlocked,
}: {
  enabled: boolean;
  onBlocked: (type: ClientIntegrityEventType, questionId: string | null) => void;
}) {
  const [notice, setNotice] = useState<ClipboardNotice | null>(null);
  const report = useRef(onBlocked);
  useEffect(() => {
    report.current = onBlocked;
  });

  useEffect(() => {
    if (!enabled) return;
    let count = 0;
    const block = (event: Event, type: ClientIntegrityEventType) => {
      event.preventDefault();
      const questionId = questionOf(event.target);
      report.current(type, questionId);
      count += 1;
      setNotice({ kind: type === "PASTE_BLOCKED" || type === "DROP_BLOCKED" ? "PASTE" : "COPY", questionId, key: count });
    };
    const listeners = Object.entries(GESTURES).map(([name, type]) => [name, (event: Event) => block(event, type)] as const);
    const beforeInput = (event: Event) => {
      if (event instanceof InputEvent && PASTE_INPUTS.has(event.inputType)) block(event, "PASTE_BLOCKED");
    };
    const dragOver = (event: Event) => event.preventDefault();
    for (const [name, listener] of listeners) document.addEventListener(name, listener, true);
    document.addEventListener("beforeinput", beforeInput, true);
    document.addEventListener("dragover", dragOver, true);
    return () => {
      for (const [name, listener] of listeners) document.removeEventListener(name, listener, true);
      document.removeEventListener("beforeinput", beforeInput, true);
      document.removeEventListener("dragover", dragOver, true);
    };
  }, [enabled]);

  return { notice: enabled ? notice : null, dismiss: () => setNotice(null) };
}
