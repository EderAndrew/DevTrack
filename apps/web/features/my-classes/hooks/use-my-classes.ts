"use client";

import { useQuery } from "@tanstack/react-query";
import { myClassesApi } from "../api/my-classes";

/** Query key of 003 contracts/web-ui.md: `["me", "classes"]`, so an acceptance (which invalidates `["me"]`) refreshes it. */
export const myClassesKeys = { list: ["me", "classes"] as const };

export const useMyClasses = () => useQuery({ queryKey: myClassesKeys.list, queryFn: myClassesApi.list });
