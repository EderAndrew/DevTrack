import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendNudge } from "../api/exam-nudges";
import { examMonitorKey } from "./use-exam-room";

/**
 * The bell's send (025/US1): the room is read again afterwards, sent or refused, so the bell shows the server's
 * state ("Aviso enviado — aguardando o aluno", or off when the attempt stopped running).
 */
export function useSendNudge(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) => sendNudge(classId, activityId, attemptId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: examMonitorKey(classId, activityId) }),
  });
}
