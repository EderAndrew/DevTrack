"use client";

import type { IntegrityEventInput, StudentActivity } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ExamTimer } from "@/components/ui/assessment/exam-timer";
import { FinalCountdown } from "@/components/ui/assessment/final-countdown";
import { TimeAlert } from "@/components/ui/assessment/time-alert";
import { type OccurrenceKind, WarningDialog } from "@/components/ui/assessment/warning-dialog";
import { Status } from "@/components/ui/status";
import { ControlledSession, type RecordEvent } from "@/features/controlled-attempt/components/controlled-attempt";
import { enterFullscreen } from "@/features/controlled-attempt/hooks/use-fullscreen";
import { activityHref } from "@/features/controlled-attempt/schemas/controlled-attempt";
import type { SentEvents } from "@/features/controlled-attempt/store/pending-events";
import { Loading, LoadFailed } from "@/features/student-activities/components/load-states";
import { useStudentActivity } from "@/features/student-activities/hooks/use-student-activities";
import { useExamClock, useTimeUp } from "../hooks/use-exam-clock";
import { useInactivity } from "../hooks/use-inactivity";
import { EXAM_STATUS_LABEL, examRunning, LAST_MINUTE_MS, occurrenceKindOf } from "../schemas/exam-attempt";
import { ExamEndNotice, ExamHoldNotice } from "./rules-screen";

/**
 * The exam on the focus page (018/US3, research T18): the 015 controlled page — monitoring,
 * fullscreen, blocked clipboard — with the exam's time around it: `ExamTimer` in the header,
 * `TimeAlert` at 10 and 5 minutes, `FinalCountdown` in the last 10 seconds, each change saved at once
 * in the last minute, and at the end (plus the server's grace) the activity read again, which the
 * server settles: "Tempo esgotado", the answers read-only. Since US4 the server's occurrence count
 * shows "Aviso n de 3" after each counted occurrence (in place of the 015 exit warning), inactivity is
 * one more monitored signal, and a hold takes the questions away for the hold notice. Anything but a
 * started exam goes back to its page.
 */
export function ExamAttempt({ activityId, userId }: { activityId: string; userId: string }) {
  const query = useStudentActivity(activityId);
  const router = useRouter();
  const misplaced = query.data !== undefined && (query.data.type !== "EXAM" || query.data.exam === null || query.data.attempt === null);
  useEffect(() => {
    if (misplaced) router.replace(activityHref(activityId));
  }, [misplaced, router, activityId]);

  if (query.isError) {
    return (
      <>
        <PageHeader title="Prova" />
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (query.isPending || misplaced) {
    return (
      <>
        <PageHeader title="Prova" />
        <Loading label="Carregando a prova…" />
      </>
    );
  }
  return <ExamSession activity={query.data} userId={userId} reload={() => query.refetch()} />;
}

function ExamSession({ activity, userId, reload }: { activity: StudentActivity; userId: string; reload: () => Promise<unknown> }) {
  const exam = activity.exam!;
  const remaining = useExamClock(exam.endsAt, activity.serverNow);
  const running = examRunning(activity);
  useTimeUp(remaining, running, () => void reload());
  const held = exam.hold !== null;
  const [warning, setWarning] = useState<{ ordinal: number; kind: OccurrenceKind } | null>(null);
  // The occurrences already known: a warning shows only for one the server counts after them.
  const counted = useRef(exam.occurrences.count);

  // 018/FR-017, FR-018 (research T6): the count is the server's, in each batch's answer.
  const onEventsSent = (result: SentEvents, sent: readonly IntegrityEventInput[]) => {
    if (!result.exam) return;
    if (result.exam.held) {
      setWarning(null);
      void reload();
      return;
    }
    if (result.exam.occurrenceCount <= counted.current) return;
    counted.current = result.exam.occurrenceCount;
    setWarning({ ordinal: result.exam.occurrenceCount, kind: occurrenceKindOf(sent) ?? "SCREEN" });
  };

  return (
    <>
      <ControlledSession
        activity={activity}
        userId={userId}
        reload={reload}
        chrome={{
          status: <Status variant="info">{EXAM_STATUS_LABEL}</Status>,
          actions: running ? <ExamTimer remaining={remaining} /> : null,
          banner: (
            <>
              {held ? <ExamHoldNotice /> : null}
              <ExamEndNotice activity={activity} />
              {running ? <TimeAlert remaining={remaining} /> : null}
              {running ? <FinalCountdown remaining={remaining} /> : null}
            </>
          ),
          saveImmediately: () => remaining() <= LAST_MINUTE_MS,
          stopped: held,
          // "Aviso n de 3" replaces the 015 exit warning.
          exitWarnings: false,
          onEventsSent,
          monitors: (record) => <InactivityWatch limitSeconds={exam.inactivityLimitSeconds} enabled={running} record={record} />,
        }}
      />
      <WarningDialog
        open={warning !== null && !held}
        ordinal={warning?.ordinal ?? 1}
        kind={warning?.kind ?? "SCREEN"}
        onReturn={() => {
          setWarning(null);
          void enterFullscreen();
        }}
      />
    </>
  );
}

/** 018/US4-3: one INACTIVITY event per idle period, through the page's recorder. */
function InactivityWatch({ limitSeconds, enabled, record }: { limitSeconds: number; enabled: boolean; record: RecordEvent }) {
  useInactivity({ limitSeconds, enabled, onIdle: (idleSeconds) => void record("INACTIVITY", undefined, idleSeconds) });
  return null;
}
