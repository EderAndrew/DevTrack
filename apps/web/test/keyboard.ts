import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

/** A code editor keeps Tab for indenting; Esc then Tab leaves it (012 P21, 014/FR-010). */
const inCodeEditor = (element: Element | null) => Boolean(element?.closest('[data-slot="code-editor"]'));

/** Every element reached by pressing Tab from the start of the document, in order. */
export async function tabSequence(user: UserEvent): Promise<Element[]> {
  (document.activeElement as HTMLElement | null)?.blur?.();
  const seen: Element[] = [];
  for (let i = 0; i < 100; i += 1) {
    if (inCodeEditor(document.activeElement)) await user.keyboard("{Escape}");
    await user.tab();
    const element = document.activeElement;
    if (!element || element === document.body || seen.includes(element)) break;
    seen.push(element);
  }
  return seen;
}

const label = (element: Element) =>
  element.getAttribute("aria-label") ?? element.getAttribute("id") ?? element.textContent?.trim() ?? element.tagName;

/**
 * SC-012/FR-075: each target is reachable with Tab alone, in the given order (other focusable
 * elements, such as links, may sit between them).
 */
export async function expectTabOrder(user: UserEvent, targets: Element[]): Promise<void> {
  const sequence = await tabSequence(user);
  const positions = targets.map((target) => sequence.indexOf(target));
  const unreachable = targets.filter((_, i) => positions[i] === -1).map(label);
  expect(unreachable, "elementos fora da ordem de tabulação").toEqual([]);
  expect(positions, "ordem de tabulação").toEqual([...positions].sort((a, b) => a - b));
}

/** Presses Tab until `target` has focus (cycling through the document at most once). */
export async function tabTo(user: UserEvent, target: Element): Promise<void> {
  for (let i = 0; i < 100 && document.activeElement !== target; i += 1) {
    if (inCodeEditor(document.activeElement)) await user.keyboard("{Escape}");
    await user.tab();
  }
  expect(document.activeElement, `foco em ${label(target)}`).toBe(target);
}

/** The field's name: a `<label for>` (native controls) or `aria-labelledby`/`aria-label` (014: the code editor's content). */
function fieldName(field: Element): string {
  const labels = (field as HTMLInputElement).labels;
  const byFor = labels ? [...labels].map((element) => element.textContent?.trim() ?? "") : [];
  const byIds = (field.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "");
  return [...byFor, ...byIds, field.getAttribute("aria-label")?.trim() ?? ""].filter(Boolean).join(" ");
}

/**
 * The field has a name, is marked invalid and `aria-describedby` points at a non-empty message.
 * The name may come from `<label for>` or, for an editable region such as the CodeMirror content
 * (014), from `aria-labelledby`.
 */
export function expectFieldErrorLinked(field: Element): void {
  expect(fieldName(field), `${label(field)} sem rótulo (label for ou aria-labelledby)`).not.toBe("");
  expect(field.getAttribute("aria-invalid"), `${label(field)} aria-invalid`).toBe("true");
  const ids = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const messages = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "");
  expect(
    messages.some((message) => message.length > 0),
    `${label(field)} sem mensagem ligada por aria-describedby`,
  ).toBe(true);
  expect(ids.some((id) => id.endsWith("-erro")), `${label(field)} sem id de erro`).toBe(true);
}
