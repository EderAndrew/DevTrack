"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { feedbackApi } from "../api/feedback-api";
import { feedbackKeys } from "./use-send-feedback";

/** "Meus feedbacks": newest first, 50 at a time ("Carregar mais"); a send invalidates it. */
export const useMyFeedbacks = () =>
  useInfiniteQuery({
    queryKey: feedbackKeys.mine,
    queryFn: ({ pageParam }) => feedbackApi.listMine(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
