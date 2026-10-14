import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_BATCH_MAX,
  AttemptPausesSchema,
  AttendanceBatchSchema,
  DeclareExitSchema,
  MyPauseSchema,
  PAUSE_NOTE_MAX,
  PauseEndKindSchema,
  PauseReasonSchema,
  ReleaseModeSchema,
  RoomSchema,
  RoomStatusSchema,
  StudentPauseReasonSchema,
  StudentPauseSchema,
  TeacherPauseSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => uuid(from + i));
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-09T13:00:00.000Z";
const LATER = "2026-10-09T13:05:00.000Z";

const teacherPause = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(900),
  initiatedBy: "STUDENT",
  reason: "BATHROOM",
  note: null,
  startedAt: AT,
  endedAt: null,
  endedBy: null,
  seconds: 120,
  ...overrides,
});

describe("016 chamada e pausas (contracts/http-api.md)", () => {
  it("016 enums: modo de liberação, situação na sala, motivos e quem pausou", () => {
    expect(ReleaseModeSchema.options).toEqual(["ALL_ENROLLED", "PRESENT_ONLY"]);
    expect(RoomStatusSchema.options).toEqual(["NOT_MARKED", "PRESENT", "ANSWERING", "OUT_OF_ROOM", "SUBMITTED"]);
    expect(PauseReasonSchema.options).toEqual(["BATHROOM", "WATER", "PHONE", "OTHER", "TEACHER"]);
    expect(StudentPauseReasonSchema.options).toEqual(["BATHROOM", "WATER", "PHONE", "OTHER"]);
  });

  it("016 a chamada aceita de 0 a 200 ids por lista, disjuntas e não ambas vazias", () => {
    expect(ATTENDANCE_BATCH_MAX).toBe(200);
    expect(accepts(AttendanceBatchSchema, { mark: [], unmark: [] })).toBe(false);
    expect(accepts(AttendanceBatchSchema, { mark: ids(1), unmark: [] })).toBe(true);
    expect(accepts(AttendanceBatchSchema, { mark: [], unmark: ids(1) })).toBe(true);
    expect(accepts(AttendanceBatchSchema, { mark: ids(200), unmark: ids(200, 201) })).toBe(true);
    expect(accepts(AttendanceBatchSchema, { mark: ids(201), unmark: [] })).toBe(false);
    expect(accepts(AttendanceBatchSchema, { mark: [], unmark: ids(201) })).toBe(false);
    expect(accepts(AttendanceBatchSchema, { mark: ids(2), unmark: ids(1, 2) })).toBe(false);
    expect(accepts(AttendanceBatchSchema, { mark: ["não-é-uuid"], unmark: [] })).toBe(false);
    expect(accepts(AttendanceBatchSchema, { mark: ids(1) })).toBe(false);
  });

  it("016 a chamada recusa campos do servidor (markedAt, releaseMode, studentUserId)", () => {
    const body = { mark: ids(1), unmark: [] };
    for (const field of ["markedAt", "releaseMode", "markedById", "classId"]) {
      expect(accepts(AttendanceBatchSchema, { ...body, [field]: AT }), field).toBe(false);
    }
  });

  it("016/FR-011 Sair da sala: motivo da lista fechada; Outro aceita um texto opcional de 1 a 200 caracteres", () => {
    expect(PAUSE_NOTE_MAX).toBe(200);
    for (const reason of ["BATHROOM", "WATER", "PHONE", "OTHER"]) {
      expect(accepts(DeclareExitSchema, { reason }), reason).toBe(true);
    }
    expect(accepts(DeclareExitSchema, { reason: "OTHER", note: "x" })).toBe(true);
    expect(accepts(DeclareExitSchema, { reason: "OTHER", note: "x".repeat(200) })).toBe(true);
    expect(accepts(DeclareExitSchema, { reason: "OTHER", note: "x".repeat(201) })).toBe(false);
    expect(accepts(DeclareExitSchema, { reason: "OTHER", note: "" })).toBe(false);
    expect(accepts(DeclareExitSchema, { reason: "OTHER", note: "   " })).toBe(false);
    expect(accepts(DeclareExitSchema, { reason: "BATHROOM", note: "x" })).toBe(false);
    expect(accepts(DeclareExitSchema, { reason: "LUNCH" })).toBe(false);
    expect(accepts(DeclareExitSchema, {})).toBe(false);
  });

  it("016/FR-011 o aluno não envia reason TEACHER nem campos do servidor", () => {
    expect(accepts(DeclareExitSchema, { reason: "TEACHER" })).toBe(false);
    for (const field of ["startedAt", "releasedAt", "endedAt", "initiatedBy", "studentUserId", "attemptId", "releaseMode"]) {
      const value = field === "initiatedBy" ? "STUDENT" : field.endsWith("Id") ? uuid(1) : AT;
      expect(accepts(DeclareExitSchema, { reason: "WATER", [field]: value }), field).toBe(false);
    }
  });

  it("016 a pausa do professor: motivo TEACHER exatamente quando o professor pausou; fim e tipo de fim juntos", () => {
    expect(accepts(TeacherPauseSchema, teacherPause())).toBe(true);
    expect(accepts(TeacherPauseSchema, teacherPause({ initiatedBy: "TEACHER", reason: "TEACHER" }))).toBe(true);
    expect(accepts(TeacherPauseSchema, teacherPause({ initiatedBy: "TEACHER", reason: "WATER" }))).toBe(false);
    expect(accepts(TeacherPauseSchema, teacherPause({ reason: "TEACHER" }))).toBe(false);
    expect(accepts(TeacherPauseSchema, teacherPause({ endedAt: LATER, endedBy: "RELEASE" }))).toBe(true);
    expect(accepts(TeacherPauseSchema, teacherPause({ endedAt: LATER }))).toBe(false);
    expect(accepts(TeacherPauseSchema, teacherPause({ endedBy: "ACCEPTED" }))).toBe(false);
    expect(accepts(TeacherPauseSchema, teacherPause({ note: "x" }))).toBe(false);
    expect(accepts(TeacherPauseSchema, teacherPause({ reason: "OTHER", note: "x" }))).toBe(true);
  });

  it("016 o aluno vê a própria pausa, sem quem liberou nem a duração", () => {
    const pause = { id: uuid(900), initiatedBy: "STUDENT", reason: "PHONE", note: null, startedAt: AT, endedAt: null };
    expect(accepts(StudentPauseSchema, pause)).toBe(true);
    expect(accepts(StudentPauseSchema, { ...pause, releasedById: uuid(2) })).toBe(false);
    expect(accepts(StudentPauseSchema, { ...pause, seconds: 10 })).toBe(false);
    expect(accepts(MyPauseSchema, { pause: null })).toBe(true);
    expect(accepts(MyPauseSchema, { pause })).toBe(true);
  });

  it("016 a sala e as pausas de uma tentativa", () => {
    const student = { studentUserId: uuid(1), name: "Ana", markedAt: AT, roomStatus: "OUT_OF_ROOM", attemptId: uuid(2), openPause: teacherPause() };
    expect(accepts(RoomSchema, { releaseMode: "PRESENT_ONLY", present: 1, enrolled: 2, students: [student] })).toBe(true);
    expect(accepts(RoomSchema, { releaseMode: "PRESENT_ONLY", present: 1, enrolled: 2, students: [{ ...student, roomStatus: "ABSENT" }] })).toBe(false);
    expect(accepts(AttemptPausesSchema, { items: [teacherPause()], totalSecondsAway: 120 })).toBe(true);
    expect(accepts(AttemptPausesSchema, { items: [], totalSecondsAway: -1 })).toBe(false);
  });
});

describe("018 pausa numa prova (contracts/http-api.md, data-model \"Derived\")", () => {
  it("018/FR-011 uma pausa aberta quando o tempo da prova acaba termina por TIME_EXPIRED, derivado", () => {
    expect(PauseEndKindSchema.options).toEqual(["RELEASE", "ACCEPTED", "ACTIVITY_CLOSED", "TIME_EXPIRED"]);
    expect(accepts(TeacherPauseSchema, teacherPause({ initiatedBy: "TEACHER", reason: "TEACHER", endedAt: LATER, endedBy: "TIME_EXPIRED" }))).toBe(true);
    expect(accepts(TeacherPauseSchema, teacherPause({ endedAt: null, endedBy: "TIME_EXPIRED" }))).toBe(false);
  });
});
