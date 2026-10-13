"use client";

import type { StudentActivity } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ExamTimer } from "@/components/ui/assessment/exam-timer";
import { FinalCountdown } from "@/components/ui/assessment/final-countdown";
import { TimeAlert } from "@/components/ui/assessment/time-alert";
import { Status } from "@/components/ui/status";
import { ControlledSession } from "@/features/controlled-attempt/components/controlled-attempt";
import { activityHref } from "@/features/controlled-attempt/schemas/controlled-attempt";
import { Loading, LoadFailed } from "@/features/student-activities/components/load-states";
import { useStudentActivity } from "@/features/student-activities/hooks/use-student-activities";
import { useExamClock, useTimeUp } from "../hooks/use-exam-clock";
import { EXAM_STATUS_LABEL, LAST_MINUTE_MS } from "../schemas/exam-attempt";
import { ExamEndNotice } from "./rules-screen";

/**
 * The exam on the focus page (018/US3, research T18): the 015 controlled page — monitoring,
 * fullscreen, blocked clipboard — with the exam's time around it: `ExamTimer` in the header,
 * `TimeAlert` at 10 and 5 minutes, `FinalCountdown` in the last 10 seconds, each change saved at once
 * in the last minute, and at the end (plus the server's grace) the activity read again, which the
 * server settles: "Tempo esgotado", the answers read-only. Anything but a started exam goes back to
 * its page.
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
  const running = activity.canAnswer && activity.submission === null && activity.pause === null && exam.hold === null && exam.endsAt !== null;
  useTimeUp(remaining, running, () => void reload());

  return (
    <ControlledSession
      activity={activity}
      userId={userId}
      reload={reload}
      chrome={{
        status: <Status variant="info">{EXAM_STATUS_LABEL}</Status>,
        actions: running ? <ExamTimer remaining={remaining} /> : null,
        banner: (
          <>
            <ExamEndNotice activity={activity} />
            {running ? <TimeAlert remaining={remaining} /> : null}
            {running ? <FinalCountdown remaining={remaining} /> : null}
          </>
        ),
        saveImmediately: () => remaining() <= LAST_MINUTE_MS,
      }}
    />
  );
}
