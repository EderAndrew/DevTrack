import { Inject, Injectable } from "@nestjs/common";
import type { IntegritySummaryList, IntegrityTimeline } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { ExamSettlement } from "../activities/exam-settlement";
import { endsAt } from "../activities/status/exam-time";
import { examTiming } from "../activities/status/facts";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { toTeacherExamHold } from "../exam-sessions/views";
import { storedEvents } from "./focus-events.service";
import { buildTimeline } from "./timeline";
import { type StoredIntegrityEvent, toEventView, toIntervalView } from "./views";

/**
 * The teacher's side of the controlled mode (015 US4, FR-024, FR-025, research F13): per student the
 * counts and durations derived from the stored events, and one attempt's timeline. Facts only — no
 * label, no grade, nothing changed (FR-026). Another teacher's class, an activity of another class or
 * an attempt of another activity → 404. Reads are not audited. An exam's expired attempts are settled
 * first by the activity module (018 research T5).
 */
@Injectable()
export class IntegrityReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassContextPolicy,
    private readonly examSettlement: ExamSettlement,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** One row per ACTIVE student of the class with an attempt, open ones up to now (US4-1, US4-4). */
  async summary(teacherId: string, classId: string, activityId: string): Promise<IntegritySummaryList> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.examSettlement.ofActivity(classId, activityId, this.clock.now(), null);
    const activity = await this.prisma.classActivity.findFirst({ where: { id: activityId, classId }, select: { id: true } });
    if (!activity) throw notFound();
    const attempts = await this.prisma.activityAttempt.findMany({
      where: { activityId, student: { enrollments: { some: { classId, status: "ACTIVE" } } } },
      select: { id: true, studentUserId: true, submission: { select: { submittedAt: true } } },
      orderBy: [{ studentUserId: "asc" }, { number: "asc" }],
    });
    const events = await this.prisma.attemptIntegrityEvent.findMany({
      where: { activityId, attemptId: { in: attempts.map((attempt) => attempt.id) } },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      select: { attemptId: true, type: true, questionId: true, recordedAt: true, clientOccurredAt: true, buffered: true },
    });
    const byAttempt = new Map<string, StoredIntegrityEvent[]>();
    for (const { attemptId, ...event } of events) byAttempt.set(attemptId, [...(byAttempt.get(attemptId) ?? []), { ...event, questionPosition: null }]);
    const now = this.clock.now();
    return {
      items: attempts.map((attempt) => ({
        studentUserId: attempt.studentUserId,
        attemptId: attempt.id,
        ...buildTimeline(byAttempt.get(attempt.id) ?? [], attempt.submission?.submittedAt ?? now).totals,
      })),
    };
  }

  /** The attempt's events with the server's time, the derived intervals and the totals (US4-2). */
  async timeline(teacherId: string, classId: string, activityId: string, attemptId: string): Promise<IntegrityTimeline> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.examSettlement.ofActivity(classId, activityId, this.clock.now(), null);
    const attempt = await this.prisma.activityAttempt.findFirst({
      where: { id: attemptId, activityId, activity: { classId } },
      select: {
        id: true,
        startedAt: true,
        submission: { select: { submittedAt: true } },
        activity: { select: { type: true, status: true, publishAt: true, durationMinutes: true, startWindowMinutes: true, closedAt: true, cancelledAt: true } },
        holds: {
          orderBy: { occurrenceOrdinal: "asc" },
          select: { id: true, attemptId: true, occurrenceOrdinal: true, openedAt: true, resolution: true, resolvedAt: true },
        },
      },
    });
    if (!attempt) throw notFound();
    const now = this.clock.now();
    const timeline = buildTimeline(await storedEvents(this.prisma, attempt.id), attempt.submission?.submittedAt ?? now);
    // An EXAM's holds with the teacher's decisions (018/FR-031, research T8); none for the others.
    const { activity } = attempt;
    const end = activity.type === "EXAM" ? endsAt(examTiming(activity), attempt.startedAt) : null;
    const holds = end ? attempt.holds.map((hold) => toTeacherExamHold(hold, end, activity.status, now)) : [];
    return { events: timeline.events.map(toEventView), intervals: timeline.intervals.map(toIntervalView), totals: timeline.totals, holds };
  }
}
