import type { RoomStatus } from "@repo/contracts";

/** What the room view knows of one student of a PRESENT_ONLY work (016 M8). */
export interface RoomFacts {
  /** An `activity_attendances` row exists. */
  marked: boolean;
  attemptStatus: "IN_PROGRESS" | "SUBMITTED" | null;
  /** A pause still open at the caller's `now` (`pauseTime(...).endedBy === null`). */
  pauseOpen: boolean;
}

/**
 * A student's situation in the room, derived on every read (016 data-model.md "Derived", FR-020):
 * not marked; present and not started; submitted; out of the room while a pause is open; otherwise
 * answering.
 */
export function deriveRoomStatus(facts: RoomFacts): RoomStatus {
  if (!facts.marked) return "NOT_MARKED";
  if (facts.attemptStatus === null) return "PRESENT";
  if (facts.attemptStatus === "SUBMITTED") return "SUBMITTED";
  return facts.pauseOpen ? "OUT_OF_ROOM" : "ANSWERING";
}
