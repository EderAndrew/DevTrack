import type { Room } from "@repo/contracts";
import { ACTIVITY_ID, CLASS_ID } from "@/features/activities/components/test-fixtures";

// Rooms of the "Chamada" tests (016): three students, built row by row.

export const ATTENDANCE_PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/attendance`;
export const ANA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
export const BRUNO = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
export const CAIO = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
export const MARKED_AT = "2026-10-01T12:05:00.000Z";

export const student = (studentUserId: string, name: string, overrides: Partial<Room["students"][number]> = {}): Room["students"][number] => ({
  studentUserId,
  name,
  markedAt: null,
  roomStatus: "NOT_MARKED",
  attemptId: null,
  openPause: null,
  ...overrides,
});

export const room = (students: Room["students"]): Room => ({
  releaseMode: "PRESENT_ONLY",
  present: students.filter((row) => row.markedAt !== null).length,
  enrolled: students.length,
  students,
});
