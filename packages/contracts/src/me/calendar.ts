import { z } from "zod";
import { IsoDateSchema, UuidSchema } from "../common/primitives.js";
import { DayKindSchema } from "../curriculum/class-meetings.js";

// 031 — the student's calendar of one disciplina da turma (contracts/http-api.md, `GET /me/classes/:classId/calendar`).
// An allowlist: never topics, a meeting's number or status, the absence's reason, ids of days, authors or times (SC-004).

/** `text`: null on CLASS; the description on the seven described kinds; the notice (or null) on TEACHER_ABSENCE. */
export const StudentCalendarDaySchema = z.strictObject({
  date: IsoDateSchema,
  kind: DayKindSchema,
  text: z.string().nullable(),
});
export type StudentCalendarDay = z.infer<typeof StudentCalendarDaySchema>;

/** `startsOn`/`endsOn` null when the class has no period (then `days` is empty). `today` from the server's clock. */
export const StudentCalendarSchema = z.strictObject({
  class: z.strictObject({
    id: UuidSchema,
    subjectName: z.string(),
    teacherName: z.string(),
    startsOn: IsoDateSchema.nullable(),
    endsOn: IsoDateSchema.nullable(),
  }),
  today: IsoDateSchema,
  days: z.array(StudentCalendarDaySchema),
});
export type StudentCalendar = z.infer<typeof StudentCalendarSchema>;
