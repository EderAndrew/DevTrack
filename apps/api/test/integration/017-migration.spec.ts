import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_ROOT } from "../helpers/env";

/**
 * 017 data-model.md: the migration moves every 003 `class_invitation_deliveries` row into
 * `mail_deliveries` as a CLASS_INVITATION delivery, keeping its id, state, attempts and dates, and
 * drops the old table. The migrations run in a schema of their own in the test database — up to
 * 016, then 003-shaped deliveries, then 017 — through one `pg` connection (simple query protocol: a
 * migration file is many statements), as in 013-migration.spec.ts.
 */
const MIGRATIONS_DIR = join(API_ROOT, "prisma/migrations");
const PRODUCTION_EMAIL_MIGRATION = "20261011120000_production_email";
const SCHEMA = "migracao_017_test";

const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");

interface DeliveryRow {
  id: string;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  last_error_code: string | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

describe("017/FR-007 os envios do convite de turma da 003 passam para a fila única", () => {
  let db: Client;
  const ids = { teacher: randomUUID(), classId: randomUUID(), invitation: randomUUID() };
  const created = new Date("2026-10-01T12:00:00Z");
  const updated = new Date("2026-10-01T12:05:00Z");
  /** One 003 delivery per state, as the 003 code leaves them. */
  const old: DeliveryRow[] = [
    { id: randomUUID(), status: "SUPERSEDED", attempts: 1, next_attempt_at: null, last_error_code: "ECONNREFUSED", sent_at: null, created_at: created, updated_at: updated },
    { id: randomUUID(), status: "FAILED", attempts: 7, next_attempt_at: null, last_error_code: "AttemptLost", sent_at: null, created_at: new Date("2026-10-02T12:00:00Z"), updated_at: updated },
    { id: randomUUID(), status: "SENT", attempts: 2, next_attempt_at: null, last_error_code: "ETIMEDOUT", sent_at: new Date("2026-10-03T12:01:00Z"), created_at: new Date("2026-10-03T12:00:00Z"), updated_at: updated },
    { id: randomUUID(), status: "PENDING", attempts: 3, next_attempt_at: new Date("2026-10-04T13:00:00Z"), last_error_code: "ECONNECTION", sent_at: null, created_at: new Date("2026-10-04T12:00:00Z"), updated_at: updated },
  ];
  const query = async <T extends object = Record<string, unknown>>(sql: string, values: unknown[] = []) => (await db.query(sql, values)).rows as T[];

  beforeAll(async () => {
    expect(migrations).toContain(PRODUCTION_EMAIL_MIGRATION);
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    await db.query(`SET search_path TO ${SCHEMA}`);
    for (const name of migrations.filter((migration) => migration < PRODUCTION_EMAIL_MIGRATION)) await db.query(migrationSql(name));
    await seed003();
    await db.query(migrationSql(PRODUCTION_EMAIL_MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.end();
  });

  async function seed003(): Promise<void> {
    await db.query("BEGIN");
    await query(`INSERT INTO users (id, email, name, password_hash, updated_at) VALUES ($1, 'prof-017-migracao@example.test', 'Professora', 'x', now())`, [ids.teacher]);
    await query(
      `INSERT INTO classes (id, teacher_id, name, code, academic_year, search_key, updated_at) VALUES ($1, $2, 'Turma', 'T1', 2026, 'turma t1', now())`,
      [ids.classId, ids.teacher],
    );
    await query(
      `INSERT INTO class_invitations (id, class_id, email, token_hash, status, expires_at, last_sent_at, invited_by_id, updated_at)
       VALUES ($1, $2, 'aluno-017-migracao@example.test', 'hash-017', 'PENDING', now() + interval '7 days', now(), $3, now())`,
      [ids.invitation, ids.classId, ids.teacher],
    );
    for (const row of old) {
      await query(
        `INSERT INTO class_invitation_deliveries (id, invitation_id, status, attempts, next_attempt_at, last_error_code, sent_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [row.id, ids.invitation, row.status, row.attempts, row.next_attempt_at, row.last_error_code, row.sent_at, row.created_at, row.updated_at],
      );
    }
    await db.query("COMMIT");
  }

  it("017/FR-007 cada envio da 003 vira um envio CLASS_INVITATION com o mesmo id, estado, tentativas, erro e datas", async () => {
    const rows = await query<DeliveryRow & { kind: string; class_invitation_id: string; invitation_id: string | null; user_id: string | null; admin_bootstrap_id: string | null; message_id: string | null }>(
      `SELECT * FROM mail_deliveries ORDER BY created_at`,
    );
    expect(rows).toHaveLength(old.length);
    for (const [index, row] of rows.entries()) {
      const expected = old[index]!;
      expect(row).toMatchObject({
        id: expected.id,
        kind: "CLASS_INVITATION",
        class_invitation_id: ids.invitation,
        invitation_id: null,
        user_id: null,
        admin_bootstrap_id: null,
        status: expected.status,
        attempts: expected.attempts,
        next_attempt_at: expected.next_attempt_at,
        last_error_code: expected.last_error_code,
        sent_at: expected.sent_at,
        created_at: expected.created_at,
        updated_at: expected.updated_at,
        message_id: null,
      });
    }
  });

  it("017/FR-007 a tabela da 003 deixa de existir", async () => {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('class_invitation_deliveries', 'mail_deliveries', 'mail_notices')`,
      [SCHEMA],
    );
    expect(tables.map((table) => table.table_name).sort()).toEqual(["mail_deliveries", "mail_notices"]);
  });

  it("017/FR-007 o envio PENDING continua na fila do worker e o estado continua sob o gatilho", async () => {
    const due = await query<{ id: string }>(`SELECT id FROM mail_deliveries WHERE status = 'PENDING' AND next_attempt_at <= $1`, [new Date("2026-10-05T00:00:00Z")]);
    expect(due.map((row) => row.id)).toEqual([old[3]!.id]);
    await expect(db.query(`UPDATE mail_deliveries SET status = 'PENDING', next_attempt_at = now() WHERE id = $1`, [old[1]!.id])).rejects.toThrow(/INVALID_STATE_TRANSITION/);
  });
});
