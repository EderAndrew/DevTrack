"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isOffline } from "../hooks/use-student-activities";

export const LOAD_ERROR = "Não foi possível carregar suas atividades.";
export const OFFLINE = "Você está sem conexão.";

export function Loading({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * The load failed (FR-033, SC-010): "sem conexão" when the request got no answer, otherwise the
 * load error, each with "Tentar novamente" — never the empty state.
 */
export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = isOffline(error);
  return (
    <Alert variant={offline ? "warning" : "danger"}>
      <AlertTitle>{offline ? OFFLINE : LOAD_ERROR}</AlertTitle>
      <AlertDescription className="gap-2">
        {offline ? <p className="m-0">Confira sua conexão com a internet.</p> : null}
        <Button type="button" variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}
