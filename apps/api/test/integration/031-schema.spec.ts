import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createMeetings,
  createSubject,
  createUser,
} from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

// 031 data-model.md: the kinds of `class_meetings`, the table `class_calendar_days`, the CHECKs per kind, the
// cross-table date triggers (CK2) and the permission seeded by the migration (CK13). Raw SQL so each rule is the
// database's own, not the service's.
describe("031 schema: tipos de dia, dias sem aula e a permissão do aluno", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  async function disciplina(cohortId?: string) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, {
      name: `Disciplina ${Math.random().toString(36).slice(2, 8)}`,
    });
    return createClass(t, teacher.id, {
      cohortId,
      subjectId: subject.id,
      startsOn: "2026-08-03",
      endsOn: "2026-12-11",
    });
  }

  const insertMeeting = (
    classId: string,
    date: string,
    kind: string,
    description: string | null,
  ) =>
    t.prisma.$executeRawUnsafe(
      `INSERT INTO "class_meetings" ("class_id", "meeting_date", "kind", "description", "updated_at")
       VALUES ($1::uuid, $2::date, $3::class_meeting_kind, $4, now())`,
      classId,
      date,
      kind,
      description,
    );

  const insertDay = (
    classId: string,
    date: string,
    kind: string,
    fields: {
      description?: string | null;
      reason?: string | null;
      notice?: string | null;
    } = {},
  ) =>
    t.prisma.$executeRawUnsafe(
      `INSERT INTO "class_calendar_days" ("class_id", "day_date", "kind", "description", "absence_reason",
                                          "absence_notice", "updated_at")
       VALUES ($1::uuid, $2::date, $3::class_calendar_day_kind, $4, $5, $6, now())`,
      classId,
      date,
      kind,
      fields.description ?? null,
      fields.reason ?? null,
      fields.notice ?? null,
    );

  it("031/FR-011 um encontro sem tipo fica Aula, sem descrição", async () => {
    const schoolClass = await disciplina();
    await createMeetings(t, schoolClass.id, ["2026-11-16"]);
    const rows = await t.prisma.$queryRawUnsafe<
      { kind: string; description: string | null }[]
    >(
      `SELECT "kind"::text AS kind, "description" FROM "class_meetings" WHERE "class_id" = $1::uuid`,
      schoolClass.id,
    );
    expect(rows).toEqual([{ kind: "CLASS", description: null }]);
  });

  it("os CHECKs de class_meetings: Aula sem descrição, os outros tipos com 1–120 code points", async () => {
    const schoolClass = await disciplina();
    await expect(
      insertMeeting(schoolClass.id, "2026-11-16", "CLASS", "Aula normal"),
    ).rejects.toThrow();
    await expect(
      insertMeeting(schoolClass.id, "2026-11-16", "EXAM", null),
    ).rejects.toThrow();
    await expect(
      insertMeeting(schoolClass.id, "2026-11-16", "EXAM", "   "),
    ).rejects.toThrow();
    await expect(
      insertMeeting(schoolClass.id, "2026-11-16", "EXAM", "é".repeat(121)),
    ).rejects.toThrow();

    await insertMeeting(schoolClass.id, "2026-11-16", "EXAM", "é".repeat(120));
    await insertMeeting(schoolClass.id, "2026-11-17", "CLASS", null);
    for (const [date, kind] of [
      ["2026-11-18", "ASSIGNMENT"],
      ["2026-11-19", "REVIEW"],
      ["2026-11-20", "MAKEUP"],
    ] as const) {
      await insertMeeting(schoolClass.id, date, kind, "Descrição");
    }
    expect(
      await t.prisma.classMeeting.count({ where: { classId: schoolClass.id } }),
    ).toBe(5);
  });

  it("os CHECKs de class_calendar_days por tipo e os limites de tamanho", async () => {
    const schoolClass = await disciplina();
    const id = schoolClass.id;
    // Feriado, Recesso e Evento especial exigem descrição e não levam motivo nem aviso.
    await expect(insertDay(id, "2026-11-20", "HOLIDAY")).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-20", "HOLIDAY", {
        description: "Feriado",
        notice: "Aviso",
      }),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-20", "HOLIDAY", {
        description: "Feriado",
        reason: "Motivo",
      }),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-20", "RECESS", { description: "x".repeat(121) }),
    ).rejects.toThrow();
    // A Falta exige motivo (1–500), recusa descrição, aceita aviso até 200.
    await expect(
      insertDay(id, "2026-11-18", "TEACHER_ABSENCE"),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-18", "TEACHER_ABSENCE", {
        reason: "Consulta",
        description: "Falta",
      }),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-18", "TEACHER_ABSENCE", {
        reason: "x".repeat(501),
      }),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-18", "TEACHER_ABSENCE", {
        reason: "Consulta",
        notice: "x".repeat(201),
      }),
    ).rejects.toThrow();
    await expect(
      insertDay(id, "2026-11-18", "TEACHER_ABSENCE", {
        reason: "Consulta",
        notice: "  ",
      }),
    ).rejects.toThrow();

    await insertDay(id, "2026-11-20", "HOLIDAY", {
      description: "Consciência Negra",
    });
    await insertDay(id, "2026-11-23", "RECESS", {
      description: "x".repeat(120),
    });
    await insertDay(id, "2026-11-27", "SPECIAL_EVENT", {
      description: "Semana acadêmica",
    });
    await insertDay(id, "2026-11-18", "TEACHER_ABSENCE", {
      reason: "x".repeat(500),
      notice: "x".repeat(200),
    });
    await insertDay(id, "2026-11-25", "TEACHER_ABSENCE", {
      reason: "Consulta médica",
    });
    expect(
      await t.prisma.classCalendarDay.count({ where: { classId: id } }),
    ).toBe(5);

    // UNIQUE (class_id, day_date)
    await expect(
      insertDay(id, "2026-11-20", "RECESS", { description: "Outro" }),
    ).rejects.toThrow();
  });

  it("031/FR-013 uma data é encontro ou dia sem aula da disciplina, nunca os dois; outra disciplina da turma não conta", async () => {
    const schoolClass = await disciplina();
    await createMeetings(t, schoolClass.id, ["2026-11-16"]);
    await insertDay(schoolClass.id, "2026-11-20", "HOLIDAY", {
      description: "Consciência Negra",
    });

    await expect(
      insertDay(schoolClass.id, "2026-11-16", "HOLIDAY", {
        description: "Feriado",
      }),
    ).rejects.toThrow();
    await expect(
      insertMeeting(schoolClass.id, "2026-11-20", "CLASS", null),
    ).rejects.toThrow();
    // Moving a meeting onto a marked day is refused too (UPDATE OF meeting_date).
    await expect(
      t.prisma.$executeRawUnsafe(
        `UPDATE "class_meetings" SET "meeting_date" = '2026-11-20' WHERE "class_id" = $1::uuid`,
        schoolClass.id,
      ),
    ).rejects.toThrow();

    const other = await disciplina(schoolClass.cohortId);
    await insertMeeting(other.id, "2026-11-20", "CLASS", null);
    await insertDay(other.id, "2026-11-16", "SPECIAL_EVENT", {
      description: "Palestra",
    });
    expect(
      await t.prisma.classMeeting.count({ where: { classId: other.id } }),
    ).toBe(1);
  });

  it("a permissão calendario.turma.visualizar existe e só o papel STUDENT a tem", async () => {
    const permission = await t.prisma.permission.findUnique({
      where: { key: "calendario.turma.visualizar" },
    });
    expect(permission?.description).toBe(
      "Ver o calendário das disciplinas das próprias turmas",
    );
    const grants = await t.prisma.rolePermission.findMany({
      where: { permission: { key: "calendario.turma.visualizar" } },
      select: { role: { select: { key: true } } },
    });
    expect(grants.map((grant) => grant.role.key)).toEqual(["STUDENT"]);
  });
});
