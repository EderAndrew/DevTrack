"use client";

import type { StudentActivity } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { enterFullscreen, exitFullscreen } from "@/features/controlled-attempt/hooks/use-fullscreen";
import { controlledAnswerHref } from "@/features/controlled-attempt/schemas/controlled-attempt";
import { useStartAttempt } from "@/features/student-activities/hooks/use-student-activities";
import { CONTINUE_EXAM, EXAM_CLOSED, EXAM_RULES_TITLE, examRules, ON_HOLD, START_CLOSED, START_EXAM, TIME_OVER } from "../schemas/exam-attempt";

/**
 * An exam on the activity's page, before or between the answers (018/US3, contracts/web-ui.md): the
 * rules and "Li as regras e quero iniciar" — the explicit acceptance the server requires
 * (`acceptRules: true`, FR-011) —, which asks for fullscreen in the click itself and opens the focus
 * page; "Continuar a prova" for an attempt in progress; or why it can't start. Whether it may start
 * comes from the API (`canAnswer`, the start deadline and `serverNow`), never the browser's clock.
 */
export function ExamEntry({ activity }: { activity: StudentActivity }) {
  const router = useRouter();
  const start = useStartAttempt(activity.id);
  const [busy, setBusy] = useState(false);
  const exam = activity.exam!;
  const started = activity.attempt !== null;

  // 018/FR-018: on hold there is nothing to continue until the teacher decides.
  if (exam.hold) return <ExamHoldNotice />;

  if (!started && !activity.canAnswer) {
    const closed = Date.parse(activity.serverNow) > Date.parse(exam.startDeadline);
    return (
      <Alert variant="info">
        <AlertTitle>{closed ? START_CLOSED : EXAM_CLOSED}</AlertTitle>
      </Alert>
    );
  }

  const begin = async () => {
    setBusy(true);
    const fullscreen = enterFullscreen();
    try {
      if (!started) await start.mutateAsync({ acceptRules: true });
      await fullscreen;
      router.push(controlledAnswerHref(activity.id));
    } catch {
      await fullscreen;
      await exitFullscreen();
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="regras-da-prova" className="flex flex-col items-start gap-4">
      <Alert variant="info">
        <AlertTitle id="regras-da-prova">{EXAM_RULES_TITLE}</AlertTitle>
        <ul className="m-0 flex flex-col gap-1 pl-5">
          {examRules(exam).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Alert>
      <p className="m-0 text-body">
        {activity.questions.length === 1 ? "1 questão" : `${activity.questions.length} questões`}. Suas respostas são salvas
        automaticamente.
      </p>
      <Button type="button" loading={busy} onClick={() => void begin()}>
        {started ? CONTINUE_EXAM : START_EXAM}
      </Button>
      {start.isError ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(start.error)}</AlertTitle>
        </Alert>
      ) : null}
    </section>
  );
}

/** How an exam ended, above its read-only answers (018/FR-013); the decisions on a hold come with US5. */
export function ExamEndNotice({ activity }: { activity: StudentActivity }) {
  if (activity.exam?.endReason !== "TIME_EXPIRED") return null;
  return (
    <Alert variant="info">
      <AlertTitle>{TIME_OVER}</AlertTitle>
    </Alert>
  );
}

/**
 * "Prova encerrada por excesso de avisos…" (018/FR-018, contracts/web-ui.md "Hold"): the 4th
 * occurrence closed the attempt for now; no question or answer is shown until the teacher decides.
 */
export function ExamHoldNotice() {
  return (
    <Alert variant="warning">
      <AlertTitle>{ON_HOLD}</AlertTitle>
    </Alert>
  );
}
