import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ReleaseModeSchema, RoomStatusSchema } from "./enums.js";
import { TeacherPauseSchema } from "./pauses.js";

// The teacher's attendance of a work (016 contracts/http-api.md, research M3, M5, M8). Marking a
// student present releases the work to them; the time of the mark comes from the server clock.

/** Ids per list of one batch: covers the largest class (research M11). */
export const ATTENDANCE_BATCH_MAX = 200;

const StudentIdsSchema = z.array(UuidSchema).max(ATTENDANCE_BATCH_MAX);

/** `POST /classes/:classId/activities/:activityId/attendance`: disjoint lists, not both empty. */
export const AttendanceBatchSchema = z
  .strictObject({ mark: StudentIdsSchema, unmark: StudentIdsSchema })
  .refine((batch) => batch.mark.length + batch.unmark.length > 0, "EMPTY_BATCH")
  .refine((batch) => {
    const marked = new Set(batch.mark);
    return !batch.unmark.some((id) => marked.has(id));
  }, "MARK_AND_UNMARK");
export type AttendanceBatch = z.infer<typeof AttendanceBatchSchema>;

export const RoomStudentSchema = z.strictObject({
  studentUserId: UuidSchema,
  name: z.string(),
  markedAt: IsoDateTimeSchema.nullable(),
  roomStatus: RoomStatusSchema,
  attemptId: UuidSchema.nullable(),
  openPause: TeacherPauseSchema.nullable(),
});
export type RoomStudent = z.infer<typeof RoomStudentSchema>;

/** The "Chamada" tab: the ACTIVE enrollments by name, polled by the web (research M8). */
export const RoomSchema = z.strictObject({
  releaseMode: ReleaseModeSchema,
  present: z.int().min(0),
  enrolled: z.int().min(0),
  students: z.array(RoomStudentSchema),
});
export type Room = z.infer<typeof RoomSchema>;
