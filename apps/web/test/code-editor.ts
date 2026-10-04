import { waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

// 014 (research L13): helpers for the CodeMirror editor in jsdom. CodeMirror reads what was typed
// from the DOM after each input, so the tests type one key per `user.keyboard` call (several keys
// in one call reach jsdom faster than the editor reads them, which no real keyboard does).

/** Waits until the `CodeEditor` in `container` has swapped the textarea for CodeMirror; its content. */
export async function codeMirrorContent(container: Element = document.body): Promise<HTMLElement> {
  await waitFor(() => {
    if (!container.querySelector(".cm-content")) throw new Error("o CodeMirror ainda não carregou");
  });
  return container.querySelector<HTMLElement>(".cm-content")!;
}

/** Types `text` into the focused editor one character at a time (`{`, `[` escaped, `\n` = Enter). */
export async function typeCode(user: UserEvent, text: string): Promise<void> {
  for (const char of text) {
    await user.keyboard(char === "\n" ? "{Enter}" : char === "{" ? "{{" : char === "[" ? "[[" : char);
  }
}

/** The text CodeMirror shows, line by line (what a screen reader reads). */
export function codeMirrorText(content: Element): string {
  return [...content.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "").join("\n");
}

/** The `[text, class]` pairs of the colored segments, in order. */
export function syntaxSegments(content: Element): [string, string][] {
  return [...content.querySelectorAll<HTMLElement>(".cm-line span[class]")].map((span) => [span.textContent ?? "", span.className]);
}
