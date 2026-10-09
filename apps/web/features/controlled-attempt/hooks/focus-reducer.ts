import type { ClientIntegrityEventType } from "@repo/contracts";

// What the browser detects of a CONTROLLED attempt (015 research F5), as a pure reducer: the
// signals of the window and the document in, the integrity events to send out. Facts only —
// nothing here blocks, warns by itself or decides anything about the student.

/** A blur and a hidden page this close together are one exit (a tab switch fires both). */
export const SAME_EXIT_MS = 1_000;

export type FocusSignal =
  | { type: "blur"; at: number }
  | { type: "focus"; at: number }
  | { type: "hidden"; at: number }
  /** `focused`: `document.hasFocus()` when the page became visible (some phones fire no `focus`). */
  | { type: "visible"; at: number; focused: boolean }
  | { type: "fullscreen-exit"; at: number }
  | { type: "fullscreen-enter"; at: number };

export interface FocusState {
  /** Out of the attempt's screen since an exit was recorded. */
  away: boolean;
  blurred: boolean;
  hidden: boolean;
  /** When the last exit was recorded. */
  exitAt: number | null;
  fullscreen: boolean;
}

export const INITIAL_FOCUS: FocusState = { away: false, blurred: false, hidden: false, exitAt: null, fullscreen: false };

/** The page may start in fullscreen (requested in the click of "Iniciar"). */
export const initialFocus = (fullscreen: boolean): FocusState => ({ ...INITIAL_FOCUS, fullscreen });

export interface FocusStep {
  state: FocusState;
  /** In order; empty when the signal changes nothing worth recording. */
  emit: ClientIntegrityEventType[];
}

/**
 * Exit = the page hidden or the window without focus; a blur followed by a hidden page within
 * `SAME_EXIT_MS` (or any signal while already away) is the same exit. Return = visible and focused
 * again. The page's own dialogs move the focus inside the document and never blur the window, so
 * they don't count (015/FR-009). Fullscreen exits and re-entries are recorded on their own.
 */
export function focusReducer(state: FocusState, signal: FocusSignal): FocusStep {
  switch (signal.type) {
    case "blur":
      return leave({ ...state, blurred: true }, signal.at);
    case "hidden": {
      const next = { ...state, hidden: true };
      if (state.away && state.exitAt !== null && signal.at - state.exitAt <= SAME_EXIT_MS) return { state: next, emit: [] };
      return leave(next, signal.at);
    }
    case "focus":
      return back({ ...state, blurred: false });
    case "visible":
      return back({ ...state, hidden: false, blurred: signal.focused ? false : state.blurred });
    case "fullscreen-exit":
      return state.fullscreen ? { state: { ...state, fullscreen: false }, emit: ["FULLSCREEN_EXITED"] } : { state, emit: [] };
    case "fullscreen-enter":
      return state.fullscreen ? { state, emit: [] } : { state: { ...state, fullscreen: true }, emit: ["FULLSCREEN_ENTERED"] };
  }
}

function leave(state: FocusState, at: number): FocusStep {
  if (state.away) return { state, emit: [] };
  return { state: { ...state, away: true, exitAt: at }, emit: ["SCREEN_LEFT"] };
}

function back(state: FocusState): FocusStep {
  if (!state.away || state.blurred || state.hidden) return { state, emit: [] };
  return { state: { ...state, away: false }, emit: ["SCREEN_RETURNED"] };
}
