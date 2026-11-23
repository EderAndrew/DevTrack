import { Inject, Injectable } from "@nestjs/common";
import {
  DASHBOARD_NEXT_MAX,
  STUDENT_ACTIVITIES_PAGE_SIZE,
  type StudentActivity,
  type StudentActivityListQuery,
  type StudentDashboardQuery,
  type StudentActivityPage,
  type StudentActivityStatus,
  type StudentActivitySummary,
  type StudentDashboard,
  type StudentExerciseAttempt,
  type StudentHistoryItem,
  type StudentHistoryPage,
  type StudentHistoryQuery,
  type StudentHistorySituation,
} from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { decodeNameCursor, encodeNameCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { PermissionResolver } from "../access-control/permission-resolver";
import { AuditService } from "../audit/audit.service";
import { RankingService } from "../ranking/ranking.service";
import {
  runsCode,
  type StudentActivityInput,
  toStudentActivity,
  toStudentExerciseAttempt,
  toStudentSummary,
} from "../activities/views/student-view";
import { CodeRunAvailability } from "../activities/code-run-availability";
import { ExamSettlement } from "../activities/exam-settlement";
import { GroupSettlement } from "../activities/group-settlement";
import { canAnswer } from "../activities/status/operations";
import {
  afterCursor,
  byDelivery,
  DELIVERED_STATUSES,
  deliveredAt,
  endedAt,
  historyCursor,
  historySituation,
  inHistory,
  matchesSearch,
  rowDate,
  type HistoryEntry,
} from "./history";
import { StudentActivityLoader } from "./student-activity-loader";

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const GET_ROUTE = "/me/activities/:activityId";
const GET_ATTEMPT_ROUTE = "/me/activities/:activityId/attempts/:number";

/** "Minhas atividades" filter → the statuses it covers; `COMPLETED` is back in 029 (FR-008, research HC5). */
const FILTER_STATUSES: Record<NonNullable<StudentActivityListQuery["status"]>, readonly StudentActivityStatus[]> = {
  PENDING: ["PENDING"],
  IN_PROGRESS: ["IN_PROGRESS"],
  OVERDUE: ["OVERDUE"],
  COMPLETED: DELIVERED_STATUSES,
};

/** One scoped activity of the student and where it belongs (028 HI11, HI13): delivered, missed, or still open. */
interface Classified {
  input: StudentActivityInput;
  summary: StudentActivitySummary;
  delivered: boolean;
  missed: boolean;
}

/** One row of the "Histórico" (029 research HC4): its input, its dated summary and its situation. */
interface HistoryRow {
  input: StudentActivityInput;
  entry: HistoryEntry;
  situation: StudentHistorySituation;
}

const MAX_EPOCH_MS = 8_640_000_000_000_000;

/**
 * The list's order as one text key (research P16, 013 K9): nearest deadline first; the activities
 * without a deadline (EXERCISE) after them, newest publication first. ISO dates of this range and the
 * zero-padded inverted publication sort as text.
 */
const orderKey = (item: StudentActivitySummary): string =>
  item.deadline !== null ? `0|${item.deadline}` : `1|${String(MAX_EPOCH_MS - Date.parse(item.publishedAt)).padStart(16, "0")}`;

/** By `orderKey`, then id. */
const byDeadline = (a: StudentActivitySummary, b: StudentActivitySummary) =>
  orderKey(a).localeCompare(orderKey(b)) || a.id.localeCompare(b.id);

/**
 * The student's dashboard, list and activity (012 US2, research P16–P18). Everything comes from
 * `StudentActivityLoader` (the session user's ACTIVE enrollments only) and leaves through the
 * student-view builders; statuses are derived with the server clock on every read. The result block
 * needs `notas.proprias.visualizar` as well as the release; its first read is audited once (US6).
 */
@Injectable()
export class MyActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: StudentActivityLoader,
    private readonly permissions: PermissionResolver,
    private readonly audit: AuditService,
    private readonly ranking: RankingService,
    private readonly examSettlement: ExamSettlement,
    private readonly groupSettlement: GroupSettlement,
    private readonly codeRuns: CodeRunAvailability,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The Painel; with `classId` (026, research D4) every block, the ranking included, is that class's only. */
  async dashboard(userId: string, query: StudentDashboardQuery = {}): Promise<StudentDashboard> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const all = await this.classified(userId, now, query.classId);
    // 028/FR-025 (HI13): the counters and lists are those of "Minhas atividades" (what is still open); "Concluídas"
    // counts the deliveries, which the web links to the "Histórico".
    const items = all.filter(isOpen).map((item) => item.summary).sort(byDeadline);
    const count = (...statuses: StudentActivityStatus[]) => items.filter((item) => statuses.includes(item.status)).length;
    return {
      firstName: user.name.trim().split(/\s+/)[0] ?? "",
      counts: {
        pending: count("PENDING"),
        inProgress: count("IN_PROGRESS"),
        overdue: count("OVERDUE"),
        completed: all.filter((item) => item.delivered).length,
      },
      next: items.filter((item) => item.status === "PENDING" || item.status === "IN_PROGRESS").slice(0, DASHBOARD_NEXT_MAX),
      overdueOpen: items.filter((item) => item.status === "OVERDUE" && item.canAnswer),
      rankings: await this.ranking.dashboardFor(userId, query.classId),
      serverNow: now.toISOString(),
    };
  }

  async list(userId: string, query: StudentActivityListQuery): Promise<StudentActivityPage> {
    const after = query.cursor === undefined ? null : decodeNameCursor(query.cursor);
    const statuses = query.status ? FILTER_STATUSES[query.status] : null;
    const pageSize = query.pageSize ?? STUDENT_ACTIVITIES_PAGE_SIZE;
    // 028/FR-023 (HI13): only what the student can still do, before the filter and the cursor.
    const matching = (await this.classified(userId, this.clock.now(), query.classId))
      .filter(isOpen)
      .map((item) => item.summary)
      .filter((item) => (statuses === null || statuses.includes(item.status)) && (query.type === undefined || item.type === query.type))
      .sort(byDeadline)
      .filter((item) => after === null || isAfter(item, after.name, after.id));
    const items = matching.slice(0, pageSize);
    const last = items.at(-1);
    return {
      items,
      nextCursor: matching.length > pageSize && last ? encodeNameCursor({ name: orderKey(last), id: last.id }) : null,
    };
  }

  /**
   * The "Histórico" (029 research HC1–HC4, 028 HI2–HI7): the scoped works and exams the teacher closed (`inHistory`),
   * each with its situation and its date (`deliveredAt ?? endedAt`), newest first, counted and paged in memory. HI7:
   * `classId` (checked first, the 026 404) narrows everything; `totals` (the cards) count every row of it, `tabCounts`
   * those matching `q`, and the list and `total` also the tab. Never an audit event (contracts/audit-events.md).
   */
  async history(userId: string, query: StudentHistoryQuery): Promise<StudentHistoryPage> {
    const after = query.cursor === undefined ? null : afterCursor(query.cursor);
    const pageSize = query.pageSize ?? STUDENT_ACTIVITIES_PAGE_SIZE;
    const rows = (await this.inputs(userId, this.clock.now(), query.classId)).filter(inHistory).map((input): HistoryRow => {
      const summary = toStudentSummary(input);
      return { input, entry: { summary, at: rowDate(input) }, situation: historySituation(input, summary) };
    });
    const countOf = (list: HistoryRow[]) => {
      const of = (situation: StudentHistorySituation) => list.filter((row) => row.situation === situation).length;
      return { all: list.length, awaiting: of("AWAITING"), graded: of("GRADED"), missed: of("MISSED"), cancelled: of("CANCELLED") };
    };
    const totals = countOf(rows);
    // 028/FR-007: the search narrows `tabCounts`, the list and `total`; the tab only the list and `total`.
    const items = rows.filter((row) => matchesSearch(row.entry.summary.title, query.q));
    const inTab = query.tab === undefined ? items : items.filter((row) => row.situation === query.tab);
    const matching = inTab.sort((a, b) => byDelivery(a.entry, b.entry)).filter((row) => after === null || after(row.entry));
    const page = matching.slice(0, pageSize);
    const last = page.at(-1);
    return {
      items: page.map(
        ({ input, entry, situation }): StudentHistoryItem => ({
          ...entry.summary,
          deliveredAt: deliveredAt(input)?.toISOString() ?? null,
          endedAt: endedAt(input).toISOString(),
          situation,
        }),
      ),
      nextCursor: matching.length > pageSize && last ? historyCursor(last.entry) : null,
      total: inTab.length,
      tabCounts: countOf(items),
      // 029/FR-004 (028 HI12): the cards are the closed deliveries (a held exam awaits too); `missed` and `cancelled`
      // travel apart, never added to `delivered`.
      totals: { delivered: totals.awaiting + totals.graded, awaiting: totals.awaiting, graded: totals.graded, missed: totals.missed, cancelled: totals.cancelled },
    };
  }

  /** Out of the student's context → 404; an existing activity also writes `student_access.denied`. */
  async get(userId: string, activityId: string, requestId: string | null): Promise<StudentActivity> {
    const now = this.clock.now();
    // 018 research T5: an expired exam attempt is settled before it is read.
    await this.examSettlement.ofAttempt(userId, activityId, now, requestId);
    // 023 research U9: a group's fallbacks (paused editor, leader without the class) persisted before the read.
    await this.groupSettlement.ofStudent(userId, activityId, now, requestId);
    const input = await this.loader.loadOne(userId, activityId, now, await this.canSeeResults(userId));
    if (input) {
      // 019 research B17, 021 Y9: the execution of the CODE questions of an activity that runs code, as of now.
      const view = toStudentActivity(input, runsCode(input) ? await this.codeRuns.at(now) : null);
      if (view.result) await this.recordFirstView(userId, activityId, now, requestId);
      return view;
    }
    return this.denied(userId, activityId, now, GET_ROUTE, requestId);
  }

  /**
   * A concluded attempt of the session student, with its answer key (013/FR-012, research K10). Out
   * of context → 404 and `student_access.denied`; an attempt that doesn't exist, isn't concluded or
   * of a Trabalho → plain 404.
   */
  async getAttempt(userId: string, activityId: string, number: number, requestId: string | null): Promise<StudentExerciseAttempt> {
    const now = this.clock.now();
    const { inContext, found } = await this.loader.loadConcluded(userId, activityId, number, now);
    if (found) return toStudentExerciseAttempt(found.questions, found.attempt);
    if (inContext) throw notFound();
    return this.denied(userId, activityId, now, GET_ATTEMPT_ROUTE, requestId);
  }

  /** 404, auditing `student_access.denied` when the activity exists (research P18). */
  private async denied(userId: string, activityId: string, now: Date, route: string, requestId: string | null): Promise<never> {
    const reason = await this.loader.deniedReason(userId, activityId, now);
    if (reason) {
      // Its own write: there is no domain change to commit with (contracts/audit-events.md).
      await this.audit.record(this.prisma, {
        type: "student_access.denied",
        actorType: "USER",
        actorUserId: userId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { route, reason },
      });
    }
    throw notFound();
  }

  /**
   * The first read of a visible result (research P19): `result_viewed_at` is set by a conditional
   * UPDATE, so concurrent reads write `activity_result.viewed` once, in the same transaction.
   */
  private async recordFirstView(userId: string, activityId: string, now: Date, requestId: string | null): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE activity_submissions SET result_viewed_at = ${now}
        WHERE activity_id = ${activityId}::uuid AND result_viewed_at IS NULL
          AND attempt_id IN (SELECT attempt_id FROM attempt_participants WHERE activity_id = ${activityId}::uuid AND student_user_id = ${userId}::uuid)
        RETURNING id`;
      const submission = rows[0];
      if (!submission) return;
      await this.audit.record(tx, {
        type: "activity_result.viewed",
        actorType: "USER",
        actorUserId: userId,
        targetType: "ACTIVITY_SUBMISSION",
        targetId: submission.id,
        requestId,
        metadata: { activityId },
      });
    });
  }

  /**
   * The student's summaries, each classified (028 HI11, HI13); with `classId` (026, research D2) only that class's, after checking an ACTIVE
   * enrollment of the student in it — the same 404 for another student's class, an ended enrollment and a class
   * that doesn't exist, not audited (a class, not an activity: contracts/audit-events.md).
   */
  private async classified(userId: string, now: Date, classId?: string): Promise<Classified[]> {
    return (await this.inputs(userId, now, classId)).map((input) => {
      const summary = toStudentSummary(input);
      // Bridge until 029 T022 (US3): the 028 "não entregue" (no delivery, can no longer answer, not a held exam).
      const delivered = DELIVERED_STATUSES.includes(summary.status);
      const held = input.facts.type === "EXAM" && input.facts.onHold === true;
      return { input, summary, delivered, missed: !delivered && !held && !canAnswer(input.facts) };
    });
  }

  /** The scoped inputs behind `classified` and the history (029 research HC1). */
  private async inputs(userId: string, now: Date, classId?: string): Promise<StudentActivityInput[]> {
    if (classId !== undefined) await this.assertActiveEnrollment(userId, classId);
    await this.examSettlement.ofStudent(userId, now, null);
    return this.loader.loadAll(userId, now, await this.canSeeResults(userId), classId);
  }

  private async assertActiveEnrollment(userId: string, classId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentUserId: userId, status: "ACTIVE", cohort: { classes: { some: { id: classId } } } },
      select: { id: true },
    });
    if (!enrollment) throw notFound();
  }

  private async canSeeResults(userId: string): Promise<boolean> {
    return (await this.permissions.effectivePermissions(userId)).has("notas.proprias.visualizar");
  }
}

/** Still for "Minhas atividades" (028 HI13): neither delivered nor missed. */
const isOpen = (item: Classified): boolean => !item.delivered && !item.missed;

/** Strictly after the cursor's `(orderKey, id)` in the list's order. */
const isAfter = (item: StudentActivitySummary, key: string, id: string) => {
  const order = orderKey(item).localeCompare(key);
  return order > 0 || (order === 0 && item.id.localeCompare(id) > 0);
};
