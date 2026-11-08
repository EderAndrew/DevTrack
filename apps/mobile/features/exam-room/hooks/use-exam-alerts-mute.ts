import type { MobileExamList } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EXAMS_QUERY_KEY } from "../../exam-list/hooks/use-exams";
import { setExamAlerts } from "../api/exam-alerts";

const withMuted = (list: MobileExamList | undefined, activityId: string, muted: boolean) =>
  list && { ...list, items: list.items.map((item) => (item.activityId === activityId ? { ...item, muted } : item)) };

/**
 * "Silenciar avisos desta prova" (024/US4): the list of exams (where `muted` lives) changes at once; a refusal
 * puts the previous state back, and either way the list is read again from the server.
 */
export function useExamAlertsMute(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => setExamAlerts(classId, activityId, muted),
    onMutate: async (muted) => {
      await queryClient.cancelQueries({ queryKey: EXAMS_QUERY_KEY });
      const previous = queryClient.getQueryData<MobileExamList>(EXAMS_QUERY_KEY);
      queryClient.setQueryData<MobileExamList | undefined>(EXAMS_QUERY_KEY, (list) => withMuted(list, activityId, muted));
      return { previous };
    },
    onError: (_error, _muted, context) => {
      if (context?.previous) queryClient.setQueryData(EXAMS_QUERY_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: EXAMS_QUERY_KEY }),
  });
}
