"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "@/components/ui/toast";
import { makeQueryClient } from "@/lib/query/query-client";

/** One `QueryClient` per browser tab (002 S10); never persisted. `Toaster` provides `useToast()`. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster>{children}</Toaster>
    </QueryClientProvider>
  );
}
