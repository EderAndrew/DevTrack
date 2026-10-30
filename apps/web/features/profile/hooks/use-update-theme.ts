"use client";

import type { MeView, UiTheme } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messageForError } from "@/lib/messages/error-messages";
import { isSessionExpired, preferencesApi } from "../api/preferences";
import { APPEARANCE_SAVE_FAILED, themeAttribute } from "../schemas/appearance";

const applyTheme = (theme: UiTheme) => {
  document.documentElement.dataset.theme = themeAttribute(theme);
};

/**
 * The theme switch of "Meu perfil" (022 research Z7): `<html data-theme>` changes at once (SC-001),
 * then the account is saved; on success the server render is refreshed so the root layout agrees,
 * on failure the previous theme and option come back. A 401 shows the app's usual message for it.
 */
export function useUpdateTheme(initial: UiTheme) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [theme, setTheme] = useState(initial);
  const mutation = useMutation({
    mutationFn: (next: UiTheme) => preferencesApi.update({ theme: next }),
    onMutate: (next) => {
      const previous = theme;
      setTheme(next);
      applyTheme(next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (!context) return;
      setTheme(context.previous);
      applyTheme(context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<MeView>(["me"], (me) => (me ? { ...me, theme: saved.theme } : me));
      router.refresh();
    },
  });

  const choose = (next: UiTheme) => {
    if (next === theme || mutation.isPending) return;
    mutation.mutate(next);
  };
  const failure = mutation.error ? (isSessionExpired(mutation.error) ? messageForError(mutation.error) : APPEARANCE_SAVE_FAILED) : null;
  return { theme, choose, pending: mutation.isPending, failure };
}
