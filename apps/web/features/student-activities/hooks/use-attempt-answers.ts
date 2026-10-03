"use client";

import type { Answer, StudentAnswer } from "@repo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "@/components/ui/assessment/save-status";
import { type ApiError, isOffline, studentActivitiesApi, toApiError } from "../api/student-activities";
import { type PendingAnswer, readPendingAnswers, writePendingAnswers } from "../store/pending-answers";

/** Saved 1,5 s after the student stops typing (research P22). */
export const SAVE_DEBOUNCE_MS = 1_500;

interface Options {
  userId: string;
  activityId: string;
  /** The attempt's answers as the server last returned them. */
  serverAnswers: readonly StudentAnswer[];
  /** False once the attempt can't be saved any more (submitted, read-only). */
  enabled: boolean;
}

export interface AttemptAnswers {
  answerOf: (questionId: string) => Answer | null;
  setAnswer: (questionId: string, answer: Answer) => void;
  /** Sends the dirty answers now (question change, leaving the page). */
  flush: () => void;
  /** "Tentar novamente": sends the content on screen again. */
  retry: () => void;
  saveState: SaveState;
  offline: boolean;
  /** The last refusal or failure (its `code` picks the message), null after a successful save. */
  error: ApiError | null;
  /** Another tab saved first and its version replaced the one on screen. */
  conflict: boolean;
  dismissConflict: () => void;
  /** Answers on screen not confirmed by the server yet. */
  pendingCount: number;
  /** For the submission: stops the scheduled save and returns the unsent answers with their revisions. */
  takePending: () => PendingAnswer[];
}

interface State {
  answers: Map<string, Answer>;
  revisions: Map<string, number>;
  dirty: Set<string>;
  saving: boolean;
  /** A change arrived while a save was in flight: save again when it ends. */
  again: boolean;
  saved: boolean;
  offline: boolean;
  error: ApiError | null;
  conflict: boolean;
}

/**
 * The answers of the answering screen (012 US3, FR-017–FR-019, research P8, P22): kept on screen,
 * the dirty ones saved 1,5 s after the last change, on question change and when the page is hidden,
 * also written to this browser until the server confirms them and replayed with their revision on
 * load and when the connection comes back. A CONFLICT replaces the local copy with the server's and
 * warns. The server stays the authority: nothing here decides whether saving is allowed.
 */
export function useAttemptAnswers({ userId, activityId, serverAnswers, enabled }: Options): AttemptAnswers {
  const [initial] = useState(() => initialState(userId, activityId, serverAnswers));
  // The ref is what the saves read and change; `view` is the copy the screen renders.
  const state = useRef<State>(initial);
  const [view, setView] = useState(() => viewOf(initial));
  const render = useCallback(() => setView(viewOf(state.current)), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    const current = state.current;
    writePendingAnswers(userId, activityId, pendingOf(current));
  }, [userId, activityId]);

  const save = useCallback(async () => {
    const current = state.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!enabled || current.dirty.size === 0) return;
    if (current.saving) {
      current.again = true;
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      current.offline = true;
      render();
      return;
    }
    const sent = pendingOf(current);
    current.saving = true;
    current.again = false;
    render();
    try {
      const result = await studentActivitiesApi.saveAnswers(activityId, { answers: sent });
      for (const item of result.results) {
        current.revisions.set(item.questionId, item.revision);
        const sentAnswer = sent.find((entry) => entry.questionId === item.questionId)?.answer;
        if (item.outcome === "CONFLICT") {
          current.answers.set(item.questionId, item.answer);
          current.dirty.delete(item.questionId);
          current.conflict = true;
        } else if (sentAnswer && sameAnswer(current.answers.get(item.questionId) ?? null, sentAnswer)) {
          current.dirty.delete(item.questionId);
        }
      }
      current.saved = true;
      current.offline = false;
      current.error = null;
    } catch (caught) {
      const error = toApiError(caught);
      current.error = error;
      current.saved = false;
      if (isOffline(error)) current.offline = true;
    } finally {
      current.saving = false;
      persist();
      render();
      if (current.again && current.dirty.size > 0 && current.error === null) void save();
    }
  }, [activityId, enabled, persist, render]);

  const setAnswer = useCallback(
    (questionId: string, answer: Answer) => {
      const current = state.current;
      if (!enabled) return;
      current.answers.set(questionId, answer);
      current.dirty.add(questionId);
      current.saved = false;
      persist();
      render();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    },
    [enabled, persist, render, save],
  );

  const flush = useCallback(() => void save(), [save]);

  useEffect(() => {
    // Replays what this browser kept from an earlier visit (reload, closed tab, offline).
    if (enabled && state.current.dirty.size > 0) void save();
    const online = () => {
      state.current.offline = false;
      render();
      void save();
    };
    const offline = () => {
      state.current.offline = true;
      render();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void save();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", hidden);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, render, save]);

  return {
    answerOf: (questionId) => view.answers.get(questionId) ?? null,
    setAnswer,
    flush,
    retry: flush,
    saveState: view.saveState,
    offline: view.offline,
    error: view.error,
    conflict: view.conflict,
    dismissConflict: useCallback(() => {
      state.current.conflict = false;
      render();
    }, [render]),
    pendingCount: view.pendingCount,
    takePending: useCallback(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return pendingOf(state.current);
    }, []),
  };
}

/** What the screen renders of the state, copied so a later change never mutates it. */
function viewOf(state: State) {
  return {
    answers: new Map(state.answers),
    saveState: (state.saving ? "saving" : state.error ? "error" : state.saved && state.dirty.size === 0 ? "saved" : "idle") as SaveState,
    offline: state.offline,
    error: state.error,
    conflict: state.conflict,
    pendingCount: state.dirty.size,
  };
}

/** The server's answers, then what this browser had not sent yet on top of them (dirty again). */
function initialState(userId: string, activityId: string, serverAnswers: readonly StudentAnswer[]): State {
  const answers = new Map(serverAnswers.map((item) => [item.questionId, item.answer]));
  const revisions = new Map(serverAnswers.map((item) => [item.questionId, item.revision]));
  const dirty = new Set<string>();
  for (const pending of readPendingAnswers(userId, activityId)) {
    answers.set(pending.questionId, pending.answer);
    // The revision the tab saw when it changed the answer: the server decides on a conflict.
    revisions.set(pending.questionId, pending.baseRevision);
    dirty.add(pending.questionId);
  }
  return { answers, revisions, dirty, saving: false, again: false, saved: false, offline: false, error: null, conflict: false };
}

/** The dirty answers with the revision the tab last saw (`0` for none). */
function pendingOf(state: State): PendingAnswer[] {
  return [...state.dirty].flatMap((questionId) => {
    const answer = state.answers.get(questionId);
    return answer ? [{ questionId, answer, baseRevision: state.revisions.get(questionId) ?? 0 }] : [];
  });
}

function sameAnswer(a: Answer | null, b: Answer): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
