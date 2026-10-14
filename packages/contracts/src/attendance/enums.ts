import { z } from "zod";

// Attendance and room exits of a work (016 data-model.md, research M2, M6, M8). Platform concepts,
// fixed in code (constitution XXI); the labels live in the web.

/**
 * Who sees an activity (research M2): every ACTIVE enrollment (012, exercises and works applied
 * before 016), or only the students marked present (every work applied since 016). Set by the server.
 */
export const ReleaseModeSchema = z.enum(["ALL_ENROLLED", "PRESENT_ONLY"]);
export type ReleaseMode = z.infer<typeof ReleaseModeSchema>;

/** A student's situation in the room of a `PRESENT_ONLY` activity, derived on every read (FR-020). */
export const RoomStatusSchema = z.enum(["NOT_MARKED", "PRESENT", "ANSWERING", "OUT_OF_ROOM", "SUBMITTED"]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

/** Who opened a pause: the student's declared exit (FR-011) or the teacher (FR-016). */
export const PauseInitiatorSchema = z.enum(["STUDENT", "TEACHER"]);
export type PauseInitiator = z.infer<typeof PauseInitiatorSchema>;

/** A pause's reason, as stored; `TEACHER` exactly when the teacher paused the student. */
export const PauseReasonSchema = z.enum(["BATHROOM", "WATER", "PHONE", "OTHER", "TEACHER"]);
export type PauseReason = z.infer<typeof PauseReasonSchema>;

/** The closed list a student picks from on "Sair da sala" (FR-011). */
export const StudentPauseReasonSchema = PauseReasonSchema.exclude(["TEACHER"]);
export type StudentPauseReason = z.infer<typeof StudentPauseReasonSchema>;

/**
 * How a pause ended, derived on read (data-model.md): the teacher's release, the teacher's
 * acceptance of the submission (012 FR-006b), the activity's close/cancel, or, in an EXAM, the
 * attempt's time running out before a release (018 data-model "Derived"). Null while open.
 */
export const PauseEndKindSchema = z.enum(["RELEASE", "ACCEPTED", "ACTIVITY_CLOSED", "TIME_EXPIRED"]);
export type PauseEndKind = z.infer<typeof PauseEndKindSchema>;
