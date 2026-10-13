"use client";

import type { StudentActivity } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ExamAlert, LEAVE_ATTEMPT } from "@/components/ui/assessment/exam-alert";
import { FocusViolationWarning } from "@/components/ui/assessment/focus-violation-warning";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { RESUME_CONTROLLED } from "@/features/attendance/schemas/attendance";
import { AnsweringSession } from "@/features/student-activities/components/activity-answering";
import { HelpCounter } from "@/features/work-help/components/help-counter";
import { useWorkHelp } from "@/features/work-help/hooks/use-work-help";
import { Loading, LoadFailed } from "@/features/student-activities/components/load-states";
import { useStudentActivity } from "@/features/student-activities/hooks/use-student-activities";
import { type ClipboardNotice, COPY_BLOCKED_MESSAGE, PASTE_BLOCKED_MESSAGE, useClipboardBlock } from "../hooks/use-clipboard-block";
import { useFocusMonitor } from "../hooks/use-focus-monitor";
import { enterFullscreen, exitFullscreen, useFullscreen } from "../hooks/use-fullscreen";
import { useIntegrityEvents } from "../hooks/use-integrity-events";
import { useLeaveGuard } from "../hooks/use-leave-guard";
import { activityHref } from "../schemas/controlled-attempt";

/**
 * "Responder em modo controlado" (015 US2, contracts/web-ui.md, research F5, F6, F14): the 012
 * answering screen with the controlled mode around it — exits, returns, fullscreen and page-leave
 * attempts recorded with the server's time and a warning after each, copy and paste blocked and
 * recorded, "Sair" and the browser's back confirmed by "Sair da avaliação?". Nothing here blocks,
 * submits or grades the attempt (FR-013). A NORMAL work, or one not started, goes back to its page.
 * Since 016 a paused attempt is not monitored: "Sair da sala" stops the monitor before anything else
 * and leaves fullscreen only after the pause, and the return asks for fullscreen by the student's
 * click (FR-017, research M10).
 */
export function ControlledAttempt({ activityId, userId }: { activityId: string; userId: string }) {
  const query = useStudentActivity(activityId);
  const router = useRouter();
  const misplaced = query.data !== undefined && (query.data.executionMode !== "CONTROLLED" || query.data.attempt === null);
  useEffect(() => {
    if (misplaced) router.replace(activityHref(activityId));
  }, [misplaced, router, activityId]);

  if (query.isError) {
    return (
      <>
        <PageHeader title="Atividade" />
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (query.isPending || misplaced) {
    return (
      <>
        <PageHeader title="Atividade" />
        <Loading label="Carregando a atividade…" />
      </>
    );
  }
  return <ControlledSession activity={query.data} userId={userId} reload={() => query.refetch()} />;
}

/**
 * What a page built on the focus page adds around it (018 `features/exam-attempt`): the header's
 * status and actions, a banner above the questions, and the last minute's immediate saves. The
 * monitoring stays here.
 */
export interface FocusChrome {
  status?: ReactNode;
  actions?: ReactNode;
  banner?: ReactNode;
  saveImmediately?: () => boolean;
}

export function ControlledSession({
  activity,
  userId,
  reload,
  chrome,
}: {
  activity: StudentActivity;
  userId: string;
  reload: () => Promise<unknown>;
  chrome?: FocusChrome;
}) {
  const router = useRouter();
  const paused = activity.pause !== null;
  const open = activity.canAnswer && activity.submission === null && !paused;
  // "Sair da sala" in progress: the monitor is off from the click on, until the student resumes.
  const [exitingRoom, setExitingRoom] = useState(false);
  const exiting = useRef(false);
  const monitoring = open && !exitingRoom;
  const events = useIntegrityEvents({ userId, activityId: activity.id, enabled: open });
  // The ref stops recording at once, before the state turns the listeners off.
  const monitor = useFocusMonitor({ enabled: monitoring, record: (type) => (exiting.current ? NOT_RECORDED : events.record(type)) });
  const clipboard = useClipboardBlock({ enabled: open, onBlocked: (type, questionId) => events.record(type, questionId ?? undefined) });
  const fullscreen = useFullscreen();
  const [leaving, setLeaving] = useState(false);
  useLeaveGuard({ enabled: monitoring, onLeaveAttempt: () => events.record("PAGE_LEAVE_ATTEMPTED"), onBack: () => setLeaving(true) });

  // Submitted, closed or paused (by the teacher too): the monitor is off by now, then the fullscreen ends.
  useEffect(() => {
    if (!open) void exitFullscreen();
  }, [open]);

  const stopMonitor = (stopped: boolean) => {
    exiting.current = stopped;
    setExitingRoom(stopped);
  };

  const leave = () => {
    setLeaving(false);
    void exitFullscreen();
    router.push(activityHref(activity.id));
  };
  const askToLeave = () => {
    events.record("PAGE_LEAVE_ATTEMPTED");
    setLeaving(true);
  };
  const notice = clipboard.notice;

  return (
    <>
      <PageHeader
        title={activity.title}
        status={chrome?.status ?? <Status variant="info">Modo controlado</Status>}
        actions={
          <>
            {chrome?.actions}
            {activity.aiHelp.allowance > 0 ? <HeaderHelpCounter activityId={activity.id} allowance={activity.aiHelp.allowance} /> : null}
            <Button type="button" variant="outline" onClick={open ? askToLeave : leave}>
              Sair
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {chrome?.banner}
        {monitor.warning ? (
          <FocusViolationWarning
            recordedAt={events.recordedAt(monitor.warning.eventId)}
            onReturnToFullscreen={
              monitor.warning.kind === "FULLSCREEN" && fullscreen.supported && !fullscreen.active ? () => void enterFullscreen() : undefined
            }
            onDismiss={monitor.dismiss}
          />
        ) : null}
        {notice && notice.questionId === null ? <ClipboardAlert key={notice.key} notice={notice} /> : null}
        <AnsweringSession
          activity={activity}
          userId={userId}
          reload={reload}
          controlled={{
            blockClipboard: open,
            questionNotice: (questionId) => noticeFor(notice, questionId, "ANSWER"),
            helpNotice: (questionId) => noticeFor(notice, questionId, "HELP"),
            roomExit: {
              stopMonitor: () => stopMonitor(true),
              resumeMonitor: () => stopMonitor(false),
              flushEvents: () => events.flush(),
              leaveFullscreen: () => void exitFullscreen(),
            },
            resume: {
              label: RESUME_CONTROLLED,
              // Fullscreen only from the student's own click, as at the start (015 F14).
              onResume: () => {
                stopMonitor(false);
                void enterFullscreen();
              },
            },
            saveImmediately: chrome?.saveImmediately,
          }}
        />
      </div>
      <ExamAlert open={leaving} onOpenChange={setLeaving} text={LEAVE_ATTEMPT} confirmLabel="Sair da avaliação" onConfirm={leave} />
    </>
  );
}

/** What the monitor gets back for an exit it must not record: the student declared it (016/FR-017). */
const NOT_RECORDED = "";

/** The work's helps in the focus page's header (contracts/web-ui.md); the same query as each question's. */
function HeaderHelpCounter({ activityId, allowance }: { activityId: string; allowance: number }) {
  const help = useWorkHelp(activityId, true);
  return <HelpCounter allowance={allowance} used={help.data?.used ?? 0} />;
}

/** The message of a gesture in a question's answer or in its "Pedir ajuda" field (015/US3-12). */
const noticeFor = (notice: ClipboardNotice | null, questionId: string, area: ClipboardNotice["area"]) =>
  notice && notice.questionId === questionId && notice.area === area ? <ClipboardAlert key={notice.key} notice={notice} /> : null;

/** The blocked gesture's message, near the field (015/FR-013a); announced again on each gesture. */
function ClipboardAlert({ notice }: { notice: ClipboardNotice }) {
  return (
    <Alert variant={notice.kind === "PASTE" ? "warning" : "info"} className="mt-3">
      <AlertTitle>{notice.kind === "PASTE" ? PASTE_BLOCKED_MESSAGE : COPY_BLOCKED_MESSAGE}</AlertTitle>
    </Alert>
  );
}
