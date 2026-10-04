"use client";

import { useQuery } from "@tanstack/react-query";
import { rankingApi } from "../api/ranking";

/** Query keys: `["ranking", …]`. Derived on every read by the server (013/FR-023): no client cache rules. */
export const rankingKeys = {
  all: ["ranking"] as const,
  mine: (classId: string) => [...rankingKeys.all, "mine", classId] as const,
  ofClass: (classId: string) => [...rankingKeys.all, "class", classId] as const,
};

/** "Ranking" of one of the student's classes (013/US4-4). */
export const useMyClassRanking = (classId: string) =>
  useQuery({ queryKey: rankingKeys.mine(classId), queryFn: () => rankingApi.mine(classId) });

/** The teacher's ranking of one of their classes (013/US5-1). */
export const useClassRanking = (classId: string) =>
  useQuery({ queryKey: rankingKeys.ofClass(classId), queryFn: () => rankingApi.ofClass(classId) });
