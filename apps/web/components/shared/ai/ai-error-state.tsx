import type { AiErrorCode } from "@repo/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AI_ERROR_GUIDANCE } from "@/lib/messages/error-messages";

export interface AiErrorStateProps {
  code: AiErrorCode;
  /** Shows "Tentar de novo"; without it the teacher has nothing to retry here. */
  onRetry?: () => void;
  className?: string;
}

/**
 * What went wrong and what the teacher can do, from the normalized code only (006/US9-2,
 * FR-066): the texts come from the message catalog and never carry internal details.
 */
export function AiErrorState({ code, onRetry, className }: AiErrorStateProps) {
  const { title, guidance } = AI_ERROR_GUIDANCE[code];
  return (
    <Alert variant="danger" data-code={code} className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{guidance}</AlertDescription>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </Alert>
  );
}
