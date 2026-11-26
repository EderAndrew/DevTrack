import type {
  DayKind,
  StudentCalendar,
  StudentCalendarDay,
} from "@repo/contracts";

/**
 * 031/FR-022, research CK6: the student's calendar is built by copying a closed list of keys, never by stripping the
 * teacher's view. A day carries only its date, its kind and the text the student may see: the description, or the
 * notice of a teacher's absence, or nothing on a plain class. Never a topic, number, status, reason, id or time.
 */

/** A meeting as the student's query selects it. */
export interface StudentMeetingRow {
  date: string;
  kind: DayKind;
  description: string | null;
}

/** A day without class as the student's query selects it (no reason: it is never read). */
export interface StudentDayRow {
  date: string;
  kind: DayKind;
  description: string | null;
  absenceNotice: string | null;
}

export interface StudentCalendarInput {
  classId: string;
  subjectName: string;
  teacherName: string;
  startsOn: string | null;
  endsOn: string | null;
  today: string;
  meetings: readonly StudentMeetingRow[];
  days: readonly StudentDayRow[];
}

const meetingDay = (row: StudentMeetingRow): StudentCalendarDay => ({
  date: row.date,
  kind: row.kind,
  text: row.kind === "CLASS" ? null : row.description,
});

const otherDay = (row: StudentDayRow): StudentCalendarDay => ({
  date: row.date,
  kind: row.kind,
  text: row.kind === "TEACHER_ABSENCE" ? row.absenceNotice : row.description,
});

export function toStudentCalendar(
  input: StudentCalendarInput,
): StudentCalendar {
  const days = [
    ...input.meetings.map(meetingDay),
    ...input.days.map(otherDay),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return {
    class: {
      id: input.classId,
      subjectName: input.subjectName,
      teacherName: input.teacherName,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    },
    today: input.today,
    days,
  };
}
