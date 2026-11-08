import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

/** The room's refresh, as the web's attendance polling (016 `ATTENDANCE_POLL_MS`). */
export const EXAM_ROOM_POLL_MS = 5000;

/**
 * The polling interval of a screen (024/FR-008): every 5 s while the screen has the focus and the app is in
 * the foreground; never in the background or behind another screen.
 */
export function useLivePolling(): number | false {
  const [focused, setFocused] = useState(false);
  // `currentState` can still be unknown at the first render; only an app known to be away stops the polling.
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return focused && active ? EXAM_ROOM_POLL_MS : false;
}
