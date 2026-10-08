import type { CodeHighlight, StudentHelpItem } from "@repo/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Spinner } from "@/components/ui/spinner";
import { HELP_EXAMPLE_LABEL, HELP_NONE_USED, HELP_NOT_USED, HELP_PREPARING, HELP_UNAVAILABLE } from "../schemas/work-help";

/**
 * One request of help under its question (015/FR-019, FR-021, FR-022): the orientation as text and
 * its example as read-only code; an out-of-scope reply with "Esta pergunta não usou uma ajuda."; the
 * unavailable message for a blocked or failed one, which carries no text. Never HTML.
 */
export function HelpGuidance({ item, highlight, waitExpired = false }: { item: StudentHelpItem; highlight: CodeHighlight | undefined; waitExpired?: boolean }) {
  const asked = <p className="m-0 text-body-sm text-text-secondary whitespace-pre-wrap">Sua pergunta: {item.question}</p>;
  if (item.status === "REQUESTED" && !waitExpired) {
    return (
      <div className="flex flex-col gap-2">
        {asked}
        <Spinner label={HELP_PREPARING} showLabel />
      </div>
    );
  }
  if (item.status === "DELIVERED") {
    return (
      <div className="flex flex-col gap-2">
        {asked}
        <Alert variant="info">
          <AlertTitle>Orientação da IA</AlertTitle>
          <AlertDescription>
            <p className="m-0 text-reading whitespace-pre-wrap">{item.message}</p>
          </AlertDescription>
        </Alert>
        {item.example ? <CodeBlock code={item.example.code} highlight={highlight} label={HELP_EXAMPLE_LABEL} /> : null}
      </div>
    );
  }
  if (item.status === "OUT_OF_SCOPE") {
    return (
      <div className="flex flex-col gap-2">
        {asked}
        <Alert variant="info">
          <AlertTitle className="whitespace-pre-wrap">{item.message}</AlertTitle>
          <AlertDescription>{HELP_NOT_USED}</AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {asked}
      <Alert variant="warning">
        <AlertTitle>{HELP_UNAVAILABLE}</AlertTitle>
        <AlertDescription>{HELP_NONE_USED}</AlertDescription>
      </Alert>
    </div>
  );
}
