import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { getExams } from "../api/exams";

export const EXAMS_QUERY_KEY = ["mobile-exams"] as const;

/** The exam list, read again each time the screen gets the focus (contracts/mobile-ui.md "Behaviour"). */
export function useExams() {
  const query = useQuery({ queryKey: EXAMS_QUERY_KEY, queryFn: getExams });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  return query;
}
