import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_ROOT } from "../helpers/env";
import { loginAs } from "../helpers/factories";
import { api, createTestApp, type TestApp } from "../helpers/test-app";

/**
 * 027 research Q9 (T046): the migration is the transition (FR-027–FR-030). A temporary database (the test database's
 * name + `_transition_027`) gets every migration before 027, the pre-027 scene of
 * `test/fixtures/transition-027/pre-027-seed.sql`, then the two 027 migrations, through one `pg` connection (simple
 * query protocol: a file is many statements and one implicit transaction). Never `prisma migrate reset`. An app over
 * that database then answers what each teacher and student sees (SC-002).
 */
const MIGRATIONS_DIR = join(API_ROOT, "prisma/migrations");
const ENUM_MIGRATION = "20261118115900_027_enum_values";
const TRANSITION_MIGRATION = "20261118120000_027_manager_classes";
const SEED = readFileSync(join(API_ROOT, "test/fixtures/transition-027/pre-027-seed.sql"), "utf8");

const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const teacherA = id("a1");
const teacherB = id("b1");
const teacherC = id("c1");
const s1 = id("51");
const s2 = id("52");
const s3 = id("53");
const subjectBd = id("5a1");
const subjectRedes = id("5b1");
const cA1 = id("c0a1");
const cB1 = id("c0b1");
const cC1 = id("c0c1");
const cB2 = id("c0b2");
const workBd = id("aa001");
const workRedes = id("aa002");
const exerciseBd = id("aa003");
const inviteA1 = id("d001");
const inviteB1 = id("d002");
const inviteC1 = id("d003");

/** The pedagogical and access tables whose rows the transition must keep, one for one (SC-002). */
const KEPT_TABLES = [
  "users",
  "classes",
  "enrollments",
  "class_invitations",
  "class_activities",
  "class_activity_questions",
  "activity_attempts",
  "attempt_participants",
  "activity_answers",
  "activity_submissions",
  "activity_question_gradings",
  "exercise_question_results",
  "mail_deliveries",
] as const;

/** Who owns each pedagogical record: activity → class and teacher; submission, grade and points → student. */
const OWNERSHIP_SQL = `
  SELECT 'activity' AS kind, a.id::text AS id, a.class_id::text AS class_id, a.teacher_id::text AS person, NULL AS value
    FROM class_activities a
  UNION ALL
  SELECT 'submission', s.id::text, a.class_id::text, s.student_user_id::text, s.grade::text
    FROM activity_submissions s JOIN class_activities a ON a.id = s.activity_id
  UNION ALL
  SELECT 'grading', g.submission_id::text || '/' || g.question_id::text, a.class_id::text, g.decided_by_id::text, g.final_grade::text
    FROM activity_question_gradings g JOIN class_activities a ON a.id = g.activity_id
  UNION ALL
  SELECT 'points', r.attempt_id::text || '/' || r.question_id::text, r.class_id::text, r.student_user_id::text, r.points::text
    FROM exercise_question_results r
  UNION ALL
  SELECT 'class', c.id::text, c.subject_id::text, c.teacher_id::text, c.status::text FROM classes c
  ORDER BY 1, 2`;

describe("027/US6 027/FR-027 as turmas de hoje continuam funcionando (transição da migration)", () => {
  let admin: Client;
  let db: Client;
  let t: TestApp;
  let transitionDatabase: string;
  const before: { counts: Record<string, number>; ownership: unknown[]; audit: number; invitations: unknown[] } = {
    counts: {},
    ownership: [],
    audit: 0,
    invitations: [],
  };

  const query = async <T extends object = Record<string, unknown>>(sql: string, values: unknown[] = []) =>
    (await db.query(sql, values)).rows as T[];
  const countOf = async (table: string) => Number((await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n);
  const cohortOf = async (classId: string) =>
    (await query<{ cohort_id: string }>(`SELECT cohort_id FROM classes WHERE id = $1`, [classId]))[0]!.cohort_id;
  const as = async (userId: string) => api(t, { cookie: await loginAs(t, { id: userId }) });

  beforeAll(async () => {
    expect(migrations).toContain(ENUM_MIGRATION);
    expect(migrations).toContain(TRANSITION_MIGRATION);
    const testUrl = new URL(process.env.DATABASE_URL!);
    transitionDatabase = `${testUrl.pathname.replace(/^\//, "")}_transition_027`;
    expect(transitionDatabase).toContain("test");
    admin = new Client({ connectionString: testUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${transitionDatabase}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${transitionDatabase}"`);

    const transitionUrl = new URL(testUrl);
    transitionUrl.pathname = `/${transitionDatabase}`;
    db = new Client({ connectionString: transitionUrl.toString() });
    await db.connect();
    for (const name of migrations.filter((migration) => migration < ENUM_MIGRATION)) await db.query(migrationSql(name));
    await db.query(SEED);

    for (const table of KEPT_TABLES) before.counts[table] = await countOf(table);
    before.ownership = await query(OWNERSHIP_SQL);
    before.audit = await countOf("audit_events");
    before.invitations = await query(`SELECT id, email, token_hash, expires_at FROM class_invitations WHERE status = 'PENDING' ORDER BY id`);

    await db.query(migrationSql(ENUM_MIGRATION));
    await db.query(migrationSql(TRANSITION_MIGRATION));

    t = await createTestApp({ config: { databaseUrl: transitionUrl.toString() } });
  }, 180_000);

  afterAll(async () => {
    await t?.close();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${transitionDatabase}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("027/US6-1 a turma de hoje vira uma turma com os mesmos dados e uma disciplina da turma do mesmo professor com tudo o que tinha", async () => {
    const [cohort] = await query(
      `SELECT k.name, k.code, k.academic_year, k.period, k.description, k.status::text AS status, k.created_by_id
         FROM cohorts k JOIN classes c ON c.cohort_id = k.id WHERE c.id = $1`,
      [cA1],
    );
    expect(cohort).toEqual({
      name: "ADS 3NA",
      code: "ADS3NA",
      academic_year: 2026,
      period: "Noite",
      description: "Turma da manhã",
      status: "ACTIVE",
      created_by_id: teacherA,
    });
    const [archived] = await query(
      `SELECT k.name, k.code, k.academic_year, k.status::text AS status, k.status_changed_at FROM cohorts k JOIN classes c ON c.cohort_id = k.id WHERE c.id = $1`,
      [cB2],
    );
    expect(archived).toEqual({ name: "Arquivada", code: "ARQ", academic_year: 2025, status: "ARCHIVED", status_changed_at: new Date("2025-12-20T00:00:00Z") });

    const teacher = await as(teacherA);
    const listed = await teacher.get("/api/classes");
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([cA1]);
    const detail = await teacher.get(`/api/classes/${cA1}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ name: "ADS 3NA", code: "ADS3NA", academicYear: 2026, subject: { id: subjectBd, name: "Banco de Dados" } });
    const activities = await teacher.get(`/api/classes/${cA1}/activities`);
    expect(activities.status).toBe(200);
    expect(activities.body.items.map((item: { id: string }) => item.id).sort()).toEqual([workBd, exerciseBd].sort());

    const redes = await as(teacherB);
    const redesActivities = await redes.get(`/api/classes/${cB1}/activities`);
    expect(redesActivities.body.items.map((item: { id: string }) => item.id)).toEqual([workRedes]);
    // The same turma, but never the other teacher's disciplina da turma (FR-024).
    expect((await teacher.get(`/api/classes/${cB1}/activities`)).status).toBe(404);
    expect((await redes.get(`/api/classes/${cA1}/activities`)).status).toBe(404);
  });

  it("027/US6-2 027/FR-029 o convite pendente continua valendo até a validade de antes e, aceito, matricula na turma nova", async () => {
    const after = await query(`SELECT id, email, token_hash, expires_at FROM class_invitations WHERE id IN ($1, $2) ORDER BY id`, [inviteB1, inviteC1]);
    expect(after).toEqual((before.invitations as { id: string }[]).filter((row) => row.id !== inviteA1));

    const accepted = await api(t).post("/api/class-invitations/accept", {
      token: "transicao027-convite-c1-xxxxxxxxxxxxxxxxxxx",
      name: "Aluna Convidada",
      ra: "RA-0271",
      password: "senha-forte-027-Transicao!",
    });
    expect(accepted.status).toBe(200);
    const [enrollment] = await query<{ cohort_id: string; status: string }>(
      `SELECT e.cohort_id, e.status::text AS status FROM enrollments e JOIN users u ON u.id = e.student_user_id WHERE u.email = 'outro@example.test'`,
    );
    expect(enrollment).toEqual({ cohort_id: await cohortOf(cC1), status: "ACTIVE" });
  });

  it("027/US6-3 027/FR-028 mesmo código e ano letivo viram uma turma com as duas disciplinas; o aluno das duas tem uma matrícula e vê as duas matérias", async () => {
    const merged = await cohortOf(cA1);
    expect(await cohortOf(cB1)).toBe(merged);
    expect(await cohortOf(cC1)).not.toBe(merged);
    expect(await cohortOf(cB2)).not.toBe(merged);
    expect(await countOf("cohorts")).toBe(3);

    // The oldest class's data (cA1, INACTIVE) and the most open status of the group (cB1, ACTIVE); each disciplina
    // da turma keeps its own status, and the cohort's status date is the one of the status it took.
    const classes = await query(`SELECT id, status::text AS status, teacher_id, subject_id FROM classes WHERE cohort_id = $1 ORDER BY id`, [merged]);
    expect(classes).toEqual([
      { id: cA1, status: "INACTIVE", teacher_id: teacherA, subject_id: subjectBd },
      { id: cB1, status: "ACTIVE", teacher_id: teacherB, subject_id: subjectRedes },
    ]);
    expect((await query(`SELECT status_changed_at FROM cohorts WHERE id = $1`, [merged]))[0]).toEqual({ status_changed_at: null });

    // S1 was ACTIVE in both: the oldest stays ACTIVE, the other ends REMOVED/MERGED (no row deleted). S2's REMOVED in
    // cA1 (by the teacher) keeps its history; S2's ACTIVE in cB1 is now the turma's (ativa se alguma estava ativa).
    const enrollments = await query(
      `SELECT id, student_user_id, status::text AS status, removal_reason::text AS removal_reason, removed_by_id FROM enrollments WHERE cohort_id = $1 ORDER BY id`,
      [merged],
    );
    expect(enrollments).toEqual([
      { id: id("e001"), student_user_id: s1, status: "ACTIVE", removal_reason: null, removed_by_id: null },
      { id: id("e002"), student_user_id: s1, status: "REMOVED", removal_reason: "MERGED", removed_by_id: null },
      { id: id("e003"), student_user_id: s2, status: "REMOVED", removal_reason: null, removed_by_id: teacherA },
      { id: id("e004"), student_user_id: s2, status: "ACTIVE", removal_reason: null, removed_by_id: null },
    ]);

    // The same e-mail pending in both: the longest link stays, the other is CANCELLED/MERGED and its e-mail retired.
    const invitations = await query(
      `SELECT id, status::text AS status, cancel_reason::text AS cancel_reason, cancelled_by_id FROM class_invitations WHERE cohort_id = $1 ORDER BY id`,
      [merged],
    );
    expect(invitations).toEqual([
      { id: inviteA1, status: "CANCELLED", cancel_reason: "MERGED", cancelled_by_id: null },
      { id: inviteB1, status: "PENDING", cancel_reason: null, cancelled_by_id: null },
    ]);
    const mails = await query(`SELECT class_invitation_id, status::text AS status FROM mail_deliveries ORDER BY class_invitation_id`);
    expect(mails).toEqual([
      { class_invitation_id: inviteA1, status: "SUPERSEDED" },
      { class_invitation_id: inviteB1, status: "PENDING" },
    ]);
    expect((await api(t).post("/api/class-invitations/accept", { token: "transicao027-convite-a1-xxxxxxxxxxxxxxxxxxx", name: "X", ra: "RA-1", password: "senha-forte-027-Transicao!" })).status).not.toBe(200);

    // S1 sees both subjects of the turma; the 2027 "ADS 3NA" stays another turma, not S1's.
    const student = await as(s1);
    const mine = JSON.stringify((await student.get("/api/me/classes")).body);
    expect(mine).toContain(cA1);
    expect(mine).toContain(cB1);
    expect(mine).not.toContain(cC1);
    const redes = await student.get(`/api/me/activities?classId=${cB1}`);
    expect(redes.status).toBe(200);
    expect(redes.body.items.map((item: { id: string }) => item.id)).toEqual([workRedes]);
    expect((await student.get(`/api/me/activities/${workRedes}`)).body.result).toMatchObject({ grade: "0.60" });

    // The ranking of each disciplina da turma: S1's 30 points stay in Banco de Dados only.
    const ranking = await (await as(teacherA)).get(`/api/classes/${cA1}/ranking`);
    expect(ranking.status).toBe(200);
    expect(ranking.body.rows.find((row: { name: string }) => row.name === "Aluno Um")).toMatchObject({ points: 30 });
    const redesRanking = await (await as(teacherB)).get(`/api/classes/${cB1}/ranking`);
    expect(redesRanking.body.rows.every((row: { points: number }) => row.points === 0)).toBe(true);
  });

  it("027/US6-4 027/FR-030 a turma de hoje sem disciplina vira uma disciplina da turma sem disciplina, pelo nome da turma, e o professor continua usando-a", async () => {
    expect((await query(`SELECT subject_id, teacher_id FROM classes WHERE id = $1`, [cC1]))[0]).toEqual({ subject_id: null, teacher_id: teacherC });
    const teacher = await as(teacherC);
    const detail = await teacher.get(`/api/classes/${cC1}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ name: "ADS 3NA", code: "ADS3NA", academicYear: 2027, subject: null });
    expect((await teacher.get(`/api/classes/${cC1}/activities`)).status).toBe(200);
    expect((await teacher.get(`/api/classes/${cC1}/enrollments`)).body.items.map((item: { student: { userId: string } }) => item.student.userId)).toContain(s3);

    const student = await as(s3);
    const listed = await student.get(`/api/me/activities?classId=${cC1}`);
    expect(listed.status).toBe(200);
    expect(JSON.stringify((await student.get("/api/me/classes")).body)).toContain(cC1);
  });

  it("027/SC-002 nada se perde, duplica ou troca de dono: contagens por tabela e dono de cada atividade, entrega, nota e ponto", async () => {
    // Before the app wrote anything (US6-2's acceptance added a user and an enrollment; US6-1 and US6-3 opened
    // sessions), the transition kept every row; read the rows of the seed, by id, to compare.
    const seeded = await query(OWNERSHIP_SQL);
    expect(seeded).toEqual(before.ownership);
    for (const table of KEPT_TABLES) {
      const rows = await countOf(table);
      const added = table === "users" || table === "enrollments" ? 1 : 0;
      expect(rows, table).toBe(before.counts[table]! + added);
    }
  });

  it("027/FR-028 cada matrícula encerrada e cada convite revogado pela reunião tem um evento do sistema com motivo MERGED, e o evento da transição tem as contagens", async () => {
    const events = await query<{ type: string; actor_type: string; target_id: string | null; metadata: Record<string, unknown> }>(
      `SELECT type, actor_type::text AS actor_type, target_id, metadata FROM audit_events
        WHERE type IN ('enrollment.removed', 'class_invitation.cancelled', 'cohort_transition.applied') ORDER BY id`,
    );
    const merged = await cohortOf(cA1);
    expect(events.slice(0, 2)).toEqual([
      { type: "enrollment.removed", actor_type: "SYSTEM", target_id: id("e002"), metadata: { cohortId: merged, userId: s1, reason: "MERGED" } },
      { type: "class_invitation.cancelled", actor_type: "SYSTEM", target_id: inviteA1, metadata: { cohortId: merged, invitationId: inviteA1, reason: "MERGED" } },
    ]);
    const transition = events.find((event) => event.type === "cohort_transition.applied")!;
    expect(transition.actor_type).toBe("SYSTEM");
    expect(transition.metadata).toMatchObject({ cohorts: 3, classes: 4, mergedCohorts: 1, mergedEnrollments: 1, mergedInvitations: 1 });
    expect(events.filter((event) => event.type === "enrollment.removed" && event.metadata.reason === "MERGED")).toHaveLength(
      transition.metadata.mergedEnrollments as number,
    );
    expect(events.filter((event) => event.type === "class_invitation.cancelled" && event.metadata.reason === "MERGED")).toHaveLength(
      transition.metadata.mergedInvitations as number,
    );
    // The seed's events are all still there (append-only).
    const seedEvents = await query(`SELECT count(*)::int AS n FROM audit_events WHERE type = 'class.created'`);
    expect(seedEvents).toEqual([{ n: 2 }]);
    expect(before.audit).toBe(2);
  });

  it("027/US6 a transição é aplicada uma única vez: reaplicar as migrations falha sem mudar nada", async () => {
    const snapshot = async () => ({
      cohorts: await query(`SELECT * FROM cohorts ORDER BY id`),
      enrollments: await query(`SELECT * FROM enrollments ORDER BY id`),
      invitations: await query(`SELECT * FROM class_invitations ORDER BY id`),
      audit: await countOf("audit_events"),
    });
    const current = await snapshot();
    await expect(db.query(migrationSql(TRANSITION_MIGRATION))).rejects.toThrow();
    await expect(db.query(migrationSql(ENUM_MIGRATION))).rejects.toThrow();
    expect(await snapshot()).toEqual(current);
  });
});
