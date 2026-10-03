import { Injectable } from "@nestjs/common";
import { type ClassRanking, type DashboardRanking, RANKING_TOP_MAX, type RankingRow } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { PermissionResolver } from "../access-control/permission-resolver";
import { rankClass } from "./rank";

/** One ACTIVE enrollment with its points in the class: what the single query answers. */
interface PointsRow {
  class_id: string;
  student_user_id: string;
  name: string;
  points: number;
}

/**
 * The class ranking (013/FR-018–FR-023, research K11–K13), derived on every read: the class's
 * ACTIVE enrollments with the user's name and the sum of their scoring results in non-cancelled
 * activities, in one query, then `rankClass`. Nothing is stored, so a conclusion or a mark shows on
 * the next read (SC-005). A row leaves with only position, name, points and `isViewer` (FR-020).
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolver,
  ) {}

  /**
   * "Ranking" of a class where the session student holds an ACTIVE enrollment, whatever the class's
   * status (INACTIVE and ARCHIVED classes stay readable); otherwise 404, the same for a class that
   * doesn't exist (FR-019, US4-6). Reading the ranking is not audited (contracts/audit-events.md).
   */
  async forStudent(studentUserId: string, classId: string): Promise<ClassRanking> {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: { id: classId, enrollments: { some: { studentUserId, status: "ACTIVE" } } },
      select: { id: true, name: true },
    });
    if (!schoolClass) throw notFound();
    const rows = await this.rowsByClass([classId], studentUserId);
    return { class: schoolClass, rows: rows.get(classId) ?? [] };
  }

  /**
   * The dashboard block (FR-021, research K13): the first five of each ACTIVE class where the student
   * holds an ACTIVE enrollment, by class name; empty without `ranking.turma.visualizar`.
   */
  async dashboardFor(studentUserId: string): Promise<DashboardRanking[]> {
    if (!(await this.permissions.effectivePermissions(studentUserId)).has("ranking.turma.visualizar")) return [];
    const classes = await this.prisma.schoolClass.findMany({
      where: { status: "ACTIVE", enrollments: { some: { studentUserId, status: "ACTIVE" } } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    if (classes.length === 0) return [];
    const rows = await this.rowsByClass(
      classes.map((schoolClass) => schoolClass.id),
      studentUserId,
    );
    return classes.map((schoolClass) => ({ class: schoolClass, top: (rows.get(schoolClass.id) ?? []).slice(0, RANKING_TOP_MAX) }));
  }

  /** The ranked rows of each class; `viewerId` marks the requester's row (null: nobody's). */
  private async rowsByClass(classIds: string[], viewerId: string | null): Promise<Map<string, RankingRow[]>> {
    const points = await this.prisma.$queryRaw<PointsRow[]>`
      SELECT e.class_id, e.student_user_id, u.name, COALESCE(SUM(r.points), 0)::int AS points
      FROM enrollments e
      JOIN users u ON u.id = e.student_user_id
      LEFT JOIN (
        exercise_question_results r
        JOIN class_activities a ON a.id = r.activity_id AND a.status <> 'CANCELLED'
      ) ON r.class_id = e.class_id AND r.student_user_id = e.student_user_id AND r.scoring
      WHERE e.class_id = ANY(${classIds}::uuid[]) AND e.status = 'ACTIVE'
      GROUP BY e.class_id, e.student_user_id, u.name`;
    const byClass = new Map<string, PointsRow[]>();
    for (const row of points) byClass.set(row.class_id, [...(byClass.get(row.class_id) ?? []), row]);
    return new Map(
      [...byClass].map(([classId, rows]) => [
        classId,
        rankClass(rows.map((row) => ({ name: row.name, points: row.points, isViewer: row.student_user_id === viewerId }))),
      ]),
    );
  }
}
