import type { RankingRow } from "@repo/contracts";

/** One ACTIVE enrollment of the class with its points (013 research K11). */
export interface RankInput {
  name: string;
  points: number;
  /** The requester's own row (FR-021); always false for the teacher. */
  isViewer: boolean;
}

/** pt-BR, ignoring accents and case ("Ávila" = "avila"). */
const byName = (a: RankInput, b: RankInput) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/**
 * The class ranking (013/FR-019, FR-020, research K11): points desc, then name alphabetically in
 * pt-BR without accent or case; standard competition positions — equal points share the position
 * and the next one skips (1, 2, 2, 4). A class with no points has everyone in 1st with 0. Pure and
 * deterministic: the same input always gives the same rows.
 */
export function rankClass(rows: readonly RankInput[]): RankingRow[] {
  const ordered = [...rows].sort((a, b) => b.points - a.points || byName(a, b));
  return ordered.map((row, index) => ({
    position: ordered.findIndex((other) => other.points === row.points) + 1,
    name: row.name,
    points: row.points,
    isViewer: row.isViewer,
  }));
}
