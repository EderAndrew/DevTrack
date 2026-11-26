import type {
  CalendarDayInput,
  CalendarDayKind,
  MeetingKind,
} from "@repo/contracts";

/**
 * 031 research CK3 (pure, no Prisma): from the saved marks of a class and a save's `add`/`set`/`remove`, the writes to
 * make. A date is a meeting (`class_meetings`, the five meeting kinds) or a day without class (`class_calendar_days`),
 * never both (CK2). The transitions are the table of data-model.md:
 *
 * - unmarked → `add` / `set` meeting kind → meeting; `set` day kind → day;
 * - meeting → `set` meeting kind → the same meeting with the new kind/description (topics kept, FR-008);
 * - meeting → `set` day kind / `remove` → the meeting leaves (its topics need resolutions) and the day is created;
 * - day → `set` meeting kind → the day is deleted and the meeting created (`add` of a day is ambiguous: refused);
 * - day → `set` day kind → the day's kind/texts; day → `remove` → deleted.
 *
 * The texts the new kind has not are dropped (FR-006): a CLASS has no description, only a TEACHER_ABSENCE has a reason
 * and a notice. `add` of an existing meeting, `remove` of an unmarked date and a `set` equal to the saved mark change
 * nothing.
 */

export interface SavedMeeting {
  id: string;
  kind: MeetingKind;
  description: string | null;
}

export interface SavedDay {
  kind: CalendarDayKind;
  description: string | null;
  absenceReason: string | null;
  absenceNotice: string | null;
}

/** The marks of the class by "YYYY-MM-DD". */
export interface SavedCalendar {
  meetings: ReadonlyMap<string, SavedMeeting>;
  days: ReadonlyMap<string, SavedDay>;
}

export interface CalendarChanges {
  add: readonly string[];
  set: readonly CalendarDayInput[];
  remove: readonly string[];
}

export interface MeetingWrite {
  date: string;
  kind: MeetingKind;
  description: string | null;
}

export interface DayWrite extends SavedDay {
  date: string;
}

export interface CalendarDiff {
  createMeetings: MeetingWrite[];
  updateMeetings: (MeetingWrite & { id: string })[];
  createDays: DayWrite[];
  updateDays: DayWrite[];
  /** Dates of days deleted: removed, or becoming meetings. */
  deleteDays: string[];
  /** Meetings that stop being meetings (removed, or becoming days): their topics follow 004/FR-029. */
  leavingMeetingIds: string[];
  /** Marks created on unmarked dates (meetings and days). */
  added: number;
  /** Marks removed, leaving the date unmarked. */
  removed: number;
  /** `set` entries that changed an existing mark's kind or texts (CK11). */
  changed: number;
}

export type CalendarDiffResult =
  | { ok: true; diff: CalendarDiff }
  /** A date in more than one of `add`/`set`/`remove` or twice in `set`, or `add` of a day without class → 400. */
  | { ok: false; reason: "DUPLICATE_DATE" | "ADD_ON_DAY" };

const MEETING_KINDS: ReadonlySet<string> = new Set<MeetingKind>([
  "CLASS",
  "EXAM",
  "ASSIGNMENT",
  "REVIEW",
  "MAKEUP",
]);

export const isMeetingKind = (kind: string): kind is MeetingKind =>
  MEETING_KINDS.has(kind);

/** The mark an input stands for, with only the texts its kind has (FR-006). */
function normalize(input: CalendarDayInput): MeetingWrite | DayWrite {
  if (input.kind === "CLASS")
    return { date: input.date, kind: "CLASS", description: null };
  if (input.kind === "TEACHER_ABSENCE") {
    return {
      date: input.date,
      kind: "TEACHER_ABSENCE",
      description: null,
      absenceReason: input.absenceReason,
      absenceNotice: input.absenceNotice ?? null,
    };
  }
  if (isMeetingKind(input.kind))
    return {
      date: input.date,
      kind: input.kind,
      description: input.description,
    };
  return {
    date: input.date,
    kind: input.kind,
    description: input.description,
    absenceReason: null,
    absenceNotice: null,
  };
}

const isMeetingWrite = (mark: MeetingWrite | DayWrite): mark is MeetingWrite =>
  isMeetingKind(mark.kind);

const sameDay = (a: SavedDay, b: SavedDay) =>
  a.kind === b.kind &&
  a.description === b.description &&
  a.absenceReason === b.absenceReason &&
  a.absenceNotice === b.absenceNotice;

export function diffCalendar(
  saved: SavedCalendar,
  changes: CalendarChanges,
): CalendarDiffResult {
  const add = [...new Set(changes.add)];
  const remove = [...new Set(changes.remove)];
  const setDates = changes.set.map((entry) => entry.date);
  const all = [...add, ...setDates, ...remove];
  if (new Set(all).size !== all.length)
    return { ok: false, reason: "DUPLICATE_DATE" };
  if (add.some((date) => saved.days.has(date)))
    return { ok: false, reason: "ADD_ON_DAY" };

  const diff: CalendarDiff = {
    createMeetings: [],
    updateMeetings: [],
    createDays: [],
    updateDays: [],
    deleteDays: [],
    leavingMeetingIds: [],
    added: 0,
    removed: 0,
    changed: 0,
  };

  for (const date of add) {
    if (saved.meetings.has(date)) continue;
    diff.createMeetings.push({ date, kind: "CLASS", description: null });
    diff.added++;
  }

  for (const input of changes.set) {
    const mark = normalize(input);
    const meeting = saved.meetings.get(mark.date);
    const day = saved.days.get(mark.date);
    if (isMeetingWrite(mark)) {
      if (meeting) {
        if (
          meeting.kind === mark.kind &&
          meeting.description === mark.description
        )
          continue;
        diff.updateMeetings.push({ ...mark, id: meeting.id });
        diff.changed++;
      } else {
        diff.createMeetings.push(mark);
        if (day) {
          diff.deleteDays.push(mark.date);
          diff.changed++;
        } else diff.added++;
      }
    } else if (day) {
      if (sameDay(day, mark)) continue;
      diff.updateDays.push(mark);
      diff.changed++;
    } else {
      diff.createDays.push(mark);
      if (meeting) {
        diff.leavingMeetingIds.push(meeting.id);
        diff.changed++;
      } else diff.added++;
    }
  }

  for (const date of remove) {
    const meeting = saved.meetings.get(date);
    if (meeting) {
      diff.leavingMeetingIds.push(meeting.id);
      diff.removed++;
    } else if (saved.days.has(date)) {
      diff.deleteDays.push(date);
      diff.removed++;
    }
  }

  return { ok: true, diff };
}

/** Meetings after the save (FR-002: "Total de aulas selecionadas"), for the 200 limit. */
export const meetingTotalAfter = (saved: SavedCalendar, diff: CalendarDiff) =>
  saved.meetings.size +
  diff.createMeetings.length -
  diff.leavingMeetingIds.length;
