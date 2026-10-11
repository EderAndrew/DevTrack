"use client";

import type { DeclareExit } from "@repo/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { myPauseApi } from "../api/attendance";
import { ATTENDANCE_POLL_MS } from "../schemas/attendance";

/** Query key: `["my-pause", activityId, purpose]`. */
export const myPauseKey = (activityId: string, purpose: MyPausePurpose) => ["my-pause", activityId, purpose] as const;

/**
 * `watch`: the answering page, which learns of a pause from another device or from the teacher.
 * `notice`: the paused notice, which learns of the release and then stops. Each has its own cache, so
 * neither starts from what the other read before.
 */
export type MyPausePurpose = "watch" | "notice";

/** The open pause of the student's own attempt, polled every 5 s while the page is visible (research M8). */
export const useMyPause = (activityId: string, enabled: boolean, purpose: MyPausePurpose) =>
  useQuery({
    queryKey: myPauseKey(activityId, purpose),
    queryFn: () => myPauseApi.get(activityId),
    enabled,
    refetchInterval: (query) => (purpose === "notice" && query.state.data?.pause === null ? false : ATTENDANCE_POLL_MS),
    refetchIntervalInBackground: false,
  });

/** "Confirmar saída": the server records the pause with its own time (FR-012). */
export const useDeclareExit = (activityId: string) =>
  useMutation({ mutationFn: (body: DeclareExit) => myPauseApi.declare(activityId, body) });

const subscribe = (changed: () => void) => {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
};

/** Whether the browser says it is connected: the exit needs the server (spec Edge Cases). */
export const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
