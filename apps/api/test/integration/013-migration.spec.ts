import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_ROOT } from "../helpers/env";

/**
 * 013 research K17 (spec Assumptions, Q3 = A): the migration converts the 012 EXERCISE activities to
 * practice without keeping grades and leaves ASSIGNMENT untouched. The migrations run in a schema of
 * their own in the test database — up to 012, then 012-shaped data, then 013 — through one `pg`
 * connection (simple query protocol: a migration file is many statements).
 */
const MIGRATIONS_DIR = join(API_ROOT, "prisma/migrations");
const EXERCISE_POINTS_MIGRATION = "20261003120000_exercise_points";
const SCHEMA = "migracao_013_test";

const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");

describe("013/FR-001 013 research K17 conversão das atividades de Exercício da 012", () => {
  let db: Client;
  const ids = {
    teacher: randomUUID(),
    student: randomUUID(),
    classId: randomUUID(),
    subject: randomUUID(),
    work: randomUUID(),
    workQuestion: randomUUID(),
    exerciseOpen: randomUUID(),
    exerciseAdvanced: randomUUID(),
    exerciseActivity: randomUUID(),
    exerciseQuestions: [randomUUID(), randomUUID()],
    exerciseAttempt: randomUUID(),
    exerciseSubmission: randomUUID(),
    assignment: randomUUID(),
    assignmentQuestion: randomUUID(),
    assignmentAttempt: randomUUID(),
    assignmentSubmission: randomUUID(),
  };
  const query = async <T extends object = Record<string, unknown>>(sql: string, values: unknown[] = []) => (await db.query(sql, values)).rows as T[];
  /** `count(*)` of a query, as `pg` returns a bigint: a string. */
  const count = async (sql: string, values: unknown[] = []) => (await query<{ count: string }>(sql, values))[0]!.count;

  beforeAll(async () => {
    expect(migrations).toContain(EXERCISE_POINTS_MIGRATION);
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    await db.query(`SET search_path TO ${SCHEMA}`);
    for (const name of migrations.filter((migration) => migration < EXERCISE_POINTS_MIGRATION)) await db.query(migrationSql(name));
    await seed012();
    await db.query(migrationSql(EXERCISE_POINTS_MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.end();
  });

  /** A 012 EXERCISE (two exercises, 2.00, deadline, released) and an ASSIGNMENT, each submitted and graded. */
  async function seed012(): Promise<void> {
    const deadline = "2026-10-10T23:59:00Z";
    await db.query("BEGIN");
    await query(
      `INSERT INTO users (id, email, name, password_hash, updated_at) VALUES
         ($1, 'prof-013-migracao@example.test', 'Professora', 'x', now()), ($2, 'aluno-013-migracao@example.test', 'Aluno', 'x', now())`,
      [ids.teacher, ids.student],
    );
    await query(`INSERT INTO student_profiles (user_id, display_name, updated_at) VALUES ($1, 'Aluno', now())`, [ids.student]);
    await query(`INSERT INTO subjects (id, teacher_id, name, search_key, updated_at) VALUES ($1, $2, 'POO', 'poo', now())`, [ids.subject, ids.teacher]);
    await query(
      `INSERT INTO classes (id, teacher_id, name, code, academic_year, search_key, subject_id, updated_at)
       VALUES ($1, $2, 'Turma', 'T1', 2026, 'turma t1', $3, now())`,
      [ids.classId, ids.teacher, ids.subject],
    );
    await query(
      `INSERT INTO works (id, teacher_id, subject_id, title, title_search_key, total_grade, question_count, origin, status, updated_at)
       VALUES ($1, $2, $3, 'Trabalho', 'trabalho', 1.00, 1, 'MANUAL', 'APPROVED', now())`,
      [ids.work, ids.teacher, ids.subject],
    );
    await query(
      `INSERT INTO work_questions (id, work_id, position, type, grading_strategy, statement, statement_search_key, value, expected_answer, updated_at)
       VALUES ($1, $2, 0, 'OPEN_ANSWER', 'AI_REVIEW', 'Explique', 'explique', 1.00, 'Herança', now())`,
      [ids.workQuestion, ids.work],
    );
    for (const [id, difficulty] of [
      [ids.exerciseOpen, "INTERMEDIATE"],
      [ids.exerciseAdvanced, "ADVANCED"],
    ]) {
      await query(
        `INSERT INTO exercises (id, teacher_id, type, difficulty, cognitive_objective, origin, status, statement, statement_search_key, explanation, expected_answer, updated_at)
         VALUES ($1, $2, 'OPEN_ANSWER', $3, 'UNDERSTAND', 'MANUAL', 'APPROVED', 'Explique', 'explique', 'Porque', 'Herança', now())`,
        [id, ids.teacher, difficulty],
      );
    }
    for (const [id, type, total, extra] of [
      [ids.exerciseActivity, "EXERCISE", "2.00", [null, null]],
      [ids.assignment, "ASSIGNMENT", "1.00", [ids.work, ids.subject]],
    ] as const) {
      await query(
        `INSERT INTO class_activities (id, class_id, teacher_id, type, title, total_grade, question_count, publish_at, deadline, late_policy,
           source_work_id, source_subject_id, result_released_at, result_released_by_id, idempotency_key, updated_at)
         VALUES ($1, $2, $3, $4, 'Atividade', $5, $6, '2026-10-01T00:00:00Z', $7, 'REJECT', $8, $9, now(), $3, $10, now())`,
        [id, ids.classId, ids.teacher, type, total, type === "EXERCISE" ? 2 : 1, deadline, extra[0], extra[1], randomUUID()],
      );
    }
    for (const [index, exerciseId] of [ids.exerciseOpen, ids.exerciseAdvanced].entries()) {
      await query(
        `INSERT INTO class_activity_questions (id, activity_id, position, type, grading_strategy, value, statement, expected_answer, explanation, source_exercise_id)
         VALUES ($1, $2, $3, 'OPEN_ANSWER', 'AI_REVIEW', 1.00, 'Explique', 'Herança', 'Porque', $4)`,
        [ids.exerciseQuestions[index], ids.exerciseActivity, index, exerciseId],
      );
    }
    await query(
      `INSERT INTO class_activity_questions (id, activity_id, position, type, grading_strategy, value, statement, expected_answer)
       VALUES ($1, $2, 0, 'OPEN_ANSWER', 'AI_REVIEW', 1.00, 'Explique', 'Herança')`,
      [ids.assignmentQuestion, ids.assignment],
    );
    for (const [attempt, activity, submission, questions, grade] of [
      [ids.exerciseAttempt, ids.exerciseActivity, ids.exerciseSubmission, ids.exerciseQuestions, "1.50"],
      [ids.assignmentAttempt, ids.assignment, ids.assignmentSubmission, [ids.assignmentQuestion], "0.80"],
    ] as const) {
      await query(
        `INSERT INTO activity_attempts (id, activity_id, student_user_id, number, status, started_at, updated_at)
         VALUES ($1, $2, $3, 1, 'IN_PROGRESS', now(), now())`,
        [attempt, activity, ids.student],
      );
      for (const question of questions) {
        await query(
          `INSERT INTO activity_answers (attempt_id, activity_id, question_id, question_type, text, saved_at) VALUES ($1, $2, $3, 'OPEN_ANSWER', 'Minha resposta', now())`,
          [attempt, activity, question],
        );
      }
      await query(`UPDATE activity_attempts SET status = 'SUBMITTED' WHERE id = $1`, [attempt]);
      await query(
        `INSERT INTO activity_submissions (id, attempt_id, activity_id, student_user_id, submitted_at, late, blank_count, grade, grade_partial, updated_at)
         VALUES ($1, $2, $3, $4, now(), false, 0, $5, false, now())`,
        [submission, attempt, activity, ids.student, grade],
      );
      for (const question of questions) {
        await query(
          `INSERT INTO activity_question_gradings (submission_id, question_id, activity_id, status, nature, final_grade, teacher_grade, decided_by_id, decided_at)
           VALUES ($1, $2, $3, 'DECIDED', 'HUMAN_DECISION', 0.50, 0.50, $4, now())`,
          [submission, question, activity, ids.teacher],
        );
      }
    }
    await db.query("COMMIT");
  }

  it("013/FR-001 o Exercício fica sem nota, prazo, regra de atraso e liberação", async () => {
    const [row] = await query<{ total_grade: string | null; deadline: Date | null; late_policy: string | null; result_released_at: Date | null; result_released_by_id: string | null }>(
      `SELECT total_grade, deadline, late_policy, result_released_at, result_released_by_id FROM class_activities WHERE id = $1`,
      [ids.exerciseActivity],
    );
    expect(row).toEqual({ total_grade: null, deadline: null, late_policy: null, result_released_at: null, result_released_by_id: null });
  });

  it("013/FR-002 as questões do Exercício perdem o valor e ganham nível e pontos do banco", async () => {
    const rows = await query(`SELECT value, difficulty::text AS difficulty, points FROM class_activity_questions WHERE activity_id = $1 ORDER BY position`, [
      ids.exerciseActivity,
    ]);
    expect(rows).toEqual([
      { value: null, difficulty: "INTERMEDIATE", points: 30 },
      { value: null, difficulty: "ADVANCED", points: 60 },
    ]);
  });

  it("013/FR-005 tentativas, respostas, entregas e correções do Exercício saem; nenhum resultado é inventado", async () => {
    for (const table of ["activity_attempts", "activity_answers", "activity_submissions", "activity_question_gradings"]) {
      expect(await count(`SELECT count(*) FROM ${table} WHERE activity_id = $1`, [ids.exerciseActivity]), table).toBe("0");
    }
    expect(await count(`SELECT count(*) FROM exercise_question_results`)).toBe("0");
  });

  it("013 spec Assumptions Q3 o Trabalho fica intacto: nota, prazo, regra, liberação, tentativa, entrega e correção", async () => {
    const [activity] = await query(
      `SELECT total_grade, deadline, late_policy::text AS late_policy, result_released_at IS NOT NULL AS released FROM class_activities WHERE id = $1`,
      [ids.assignment],
    );
    expect(activity).toEqual({ total_grade: "1.00", deadline: new Date("2026-10-10T23:59:00Z"), late_policy: "REJECT", released: true });
    const [question] = await query(`SELECT value, difficulty, points FROM class_activity_questions WHERE id = $1`, [ids.assignmentQuestion]);
    expect(question).toEqual({ value: "1.00", difficulty: null, points: null });
    const [attempt] = await query(`SELECT status::text AS status, completed_at FROM activity_attempts WHERE id = $1`, [ids.assignmentAttempt]);
    expect(attempt).toEqual({ status: "SUBMITTED", completed_at: null });
    const [submission] = await query(`SELECT grade FROM activity_submissions WHERE id = $1`, [ids.assignmentSubmission]);
    expect(submission).toEqual({ grade: "0.80" });
    expect(await count(`SELECT count(*) FROM activity_question_gradings WHERE submission_id = $1`, [ids.assignmentSubmission])).toBe("1");
  });

  it("depois da conversão as regras da 013 valem: os gatilhos de imutabilidade voltam ligados e o CHECK por tipo é validado", async () => {
    const [constraint] = await query<{ convalidated: boolean }>(
      `SELECT convalidated FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND conname = 'class_activities_type_fields_chk'`,
      [SCHEMA],
    );
    expect(constraint).toEqual({ convalidated: true });
    const disabled = await query(
      `SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND NOT t.tgisinternal AND t.tgenabled = 'D'`,
      [SCHEMA],
    );
    expect(disabled).toEqual([]);
    await expect(db.query(`UPDATE class_activity_questions SET statement = 'outro' WHERE id = $1`, [ids.assignmentQuestion])).rejects.toThrow(/immutable/);
    await expect(db.query(`UPDATE class_activities SET total_grade = 2.00 WHERE id = $1`, [ids.exerciseActivity])).rejects.toThrow(/immutable/);
    expect(await count(`SELECT count(*) FROM permissions WHERE key IN ('exercicios.corrigir', 'ranking.visualizar', 'ranking.turma.visualizar')`)).toBe("3");
  });
});
