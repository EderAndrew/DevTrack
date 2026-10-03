import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { PointsSchema } from "../activities/points.js";

// The class ranking of practice points (013 research K11–K13). Derived on every read; a row carries
// only what a classmate may see (013/FR-020, SC-007): no user id, e-mail, enrollment or activity data.

/** "Do 1º ao 5º" of the student dashboard (013/FR-021). */
export const RANKING_TOP_MAX = 5;

/**
 * One student of the class. `isViewer` marks the requester's own row (FR-021), never a fact about
 * the classmate; the teacher's ranking has it always false (K12).
 */
export const RankingRowSchema = z.strictObject({
  /** Standard competition ranking: equal points share the position (1, 2, 2, 4). */
  position: z.int().min(1),
  name: z.string(),
  points: PointsSchema,
  isViewer: z.boolean(),
});
export type RankingRow = z.infer<typeof RankingRowSchema>;

/** `GET /me/classes/:classId/ranking` and `GET /classes/:classId/ranking`: every ACTIVE enrollment. */
export const ClassRankingSchema = z.strictObject({
  class: z.strictObject({ id: UuidSchema, name: z.string() }),
  rows: z.array(RankingRowSchema),
});
export type ClassRanking = z.infer<typeof ClassRankingSchema>;

/** One class of the student dashboard: its first five rows (013/FR-021). */
export const DashboardRankingSchema = z.strictObject({
  class: z.strictObject({ id: UuidSchema, name: z.string() }),
  top: z.array(RankingRowSchema).max(RANKING_TOP_MAX),
});
export type DashboardRanking = z.infer<typeof DashboardRankingSchema>;
