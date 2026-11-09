/**
 * The warnings closed on this device (025/FR-011, research N7): kept in `sessionStorage` so the poll never shows one
 * again while its dismissal is still on its way, also after a reload of the tab. Storage may be unavailable (private
 * mode): then only this page's memory remembers.
 */
const KEY = "devtrack:avisos-fechados";

export function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberDismissed(nudgeId: string): void {
  try {
    const ids = readDismissed().filter((id) => id !== nudgeId);
    // A handful is enough: one warning is pending at a time.
    window.sessionStorage.setItem(KEY, JSON.stringify([...ids, nudgeId].slice(-20)));
  } catch {
    // No storage: the page's memory is enough for this visit.
  }
}
