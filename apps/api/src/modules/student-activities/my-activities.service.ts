import { Inject, Injectable } from "@nestjs/common";
import {
  DASHBOARD_NEXT_MAX,
  STUDENT_ACTIVITIES_PAGE_SIZE,
  type StudentActivity,
  type StudentActivityListQuery,
  type StudentActivityPage,
  type StudentActivityStatus,
  type StudentActivitySummary,
  type StudentDashboard,
} from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { PermissionResolver } from "../access-control/permission-resolver";
import { AuditService } from "../audit/audit.service";
import { toStudentActivity, toStudentSummary } from "../activities/views/student-view";
import { StudentActivityLoader } from "./student-activity-loader";

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const GET_ROUTE = "/me/activities/:activityId";

/** "Minhas atividades" filter → the statuses it covers (`COMPLETED` = SUBMITTED + GRADED). */
const FILTER_STATUSES: Record<NonNullable<StudentActivityListQuery["status"]>, readonly StudentActivityStatus[]> = {
  PENDING: ["PENDING"],
  IN_PROGRESS: ["IN_PROGRESS"],
  OVERDUE: ["OVERDUE"],
  COMPLETED: ["SUBMITTED", "GRADED"],
};

/** Nearest deadline first, then id (research P16). */
const byDeadline = (a: StudentActivitySummary, b: StudentActivitySummary) =>
  a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id);

/**
 * The student's dashboard, list and activity (012 US2, research P16–P18). Everything comes from
 * `StudentActivityLoader` (the session user's ACTIVE enrollments only) and leaves through the
 * student-view builders; statuses are derived with the server clock on every read. The result block
 * needs `notas.proprias.visualizar` as well as the release.
 */
@Injectable()
export class MyActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: StudentActivityLoader,
    private readonly permissions: PermissionResolver,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async dashboard(userId: string): Promise<StudentDashboard> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const items = (await this.summaries(userId, now)).sort(byDeadline);
    const count = (...statuses: StudentActivityStatus[]) => items.filter((item) => statuses.includes(item.status)).length;
    return {
      firstName: user.name.trim().split(/\s+/)[0] ?? "",
      counts: {
        pending: count("PENDING"),
        inProgress: count("IN_PROGRESS"),
        overdue: count("OVERDUE"),
        completed: count("SUBMITTED", "GRADED"),
      },
      next: items.filter((item) => item.status === "PENDING" || item.status === "IN_PROGRESS").slice(0, DASHBOARD_NEXT_MAX),
      overdueOpen: items.filter((item) => item.status === "OVERDUE" && item.canAnswer),
      serverNow: now.toISOString(),
    };
  }

  async list(userId: string, query: StudentActivityListQuery): Promise<StudentActivityPage> {
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const statuses = query.status ? FILTER_STATUSES[query.status] : null;
    const pageSize = query.pageSize ?? STUDENT_ACTIVITIES_PAGE_SIZE;
    const matching = (await this.summaries(userId, this.clock.now()))
      .filter((item) => (statuses === null || statuses.includes(item.status)) && (query.type === undefined || item.type === query.type))
      .sort(byDeadline)
      .filter((item) => after === null || isAfter(item, after.createdAt.toISOString(), after.id));
    const items = matching.slice(0, pageSize);
    const last = items.at(-1);
    return {
      items,
      nextCursor: matching.length > pageSize && last ? encodeCursor({ createdAt: new Date(last.deadline), id: last.id }) : null,
    };
  }

  /** Out of the student's context → 404; an existing activity also writes `student_access.denied`. */
  async get(userId: string, activityId: string, requestId: string | null): Promise<StudentActivity> {
    const now = this.clock.now();
    const input = await this.loader.loadOne(userId, activityId, now, await this.canSeeResults(userId));
    if (input) return toStudentActivity(input);
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
        metadata: { route: GET_ROUTE, reason },
      });
    }
    throw notFound();
  }

  private async summaries(userId: string, now: Date): Promise<StudentActivitySummary[]> {
    const inputs = await this.loader.loadAll(userId, now, await this.canSeeResults(userId));
    return inputs.map(toStudentSummary);
  }

  private async canSeeResults(userId: string): Promise<boolean> {
    return (await this.permissions.effectivePermissions(userId)).has("notas.proprias.visualizar");
  }
}

/** Strictly after the cursor's `(deadline, id)` in the list's order. */
const isAfter = (item: StudentActivitySummary, deadline: string, id: string) =>
  item.deadline > deadline || (item.deadline === deadline && item.id > id);
