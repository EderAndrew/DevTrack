import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditEvent } from "../../src/generated/prisma/client";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { AUDIT_EVENT_METADATA } from "../../src/modules/audit/audit-event-types";
import { API_ROOT } from "../helpers/env";
import { runFullJourney } from "../helpers/journey";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** Audit catalogues of every feature; the service's catalogue is their union (003 D13). */
const CONTRACTS = [
  resolve(API_ROOT, "../../specs/001-foundation-identity-access/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/003-class-invitations-enrollment/contracts/audit-events.md"),
];

/**
 * 003 types the journey does not emit yet (transitional). They are still checked against the
 * catalogue and, when emitted, for actor/target/metadata; only "emitted by the journey" is waived.
 * Each story removes its types when test/helpers/journey.ts starts emitting them (T073 deletes it).
 */
const PENDING_003_TYPES = new Set([
  "class_invitation.resent",
  "class_invitation.cancelled",
  "class_invitation.accepted",
  "class_invitation.acceptance_refused",
  "student.registered",
  "enrollment.created",
  "enrollment.removed",
]);

interface ContractRow {
  type: string;
  actors: string[];
  /** null = "—" (no target). */
  target: string | null;
  metadata: string[];
}

const backticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

/**
 * Rows of the event table of one contracts/audit-events.md; `a` / `b` in the type column expands
 * to two rows. The "Tipos aposentados" table (003) is not part of the catalogue.
 */
function contractRows(file: string): ContractRow[] {
  const text = readFileSync(file, "utf8").split(/^## Tipos aposentados/m)[0]!;
  return text
    .split("\n")
    .filter((line) => /^\| `[a-z_]+\.[a-z_.]+`/.test(line))
    .flatMap((line) => {
      const [typeCell, actorCell, targetCell, metadataCell] = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());
      const actors = actorCell!.split(/\\\|/).map((a) => a.trim());
      const target = targetCell === "—" ? null : targetCell!;
      // Allowed keys are the backticked words outside parentheses (those list values).
      const metadata = backticked(metadataCell!.replace(/\([^)]*\)/g, ""));
      return backticked(typeCell!).map((type) => ({ type, actors, target, metadata }));
    });
}

describe("SC-008 — trilha de auditoria (FR-070, FR-071, critério 25)", () => {
  const rows = CONTRACTS.flatMap(contractRows);

  it("o contrato e o catálogo do AuditService listam os mesmos tipos e as mesmas chaves de metadata", () => {
    expect(rows.length).toBeGreaterThanOrEqual(29 + 11);
    expect(new Set(rows.map((r) => r.type)).size).toBe(rows.length);
    const contract = Object.fromEntries(rows.map((r) => [r.type, [...r.metadata].sort()]));
    const catalogue = Object.fromEntries(
      Object.entries(AUDIT_EVENT_METADATA).map(([type, keys]) => [type, [...keys].sort()]),
    );
    expect(catalogue).toEqual(contract);
  });

  describe("cada tipo do contrato é gravado pelos fluxos da feature", () => {
    let t: TestApp;
    let events: AuditEvent[];

    beforeAll(async () => {
      t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
      await resetDb(t.prisma);
      await runFullJourney(t);
      events = await t.prisma.auditEvent.findMany({ orderBy: { id: "asc" } });
    });
    afterAll(() => t.close());

    it.each(rows.map((row) => [row.type, row] as const))("%s: ator, alvo, data, requestId e metadata", (type, row) => {
      const found = events.filter((e) => e.type === type);
      if (!PENDING_003_TYPES.has(type)) expect(found.length, `nenhum evento ${type}`).toBeGreaterThan(0);

      for (const event of found) {
        expect(row.actors).toContain(event.actorType);
        if (event.actorType === "USER") expect(event.actorUserId).not.toBeNull();
        expect(event.targetType).toBe(row.target);
        if (row.target) expect(event.targetId).not.toBeNull();
        expect(event.occurredAt).toBeInstanceOf(Date);
        expect(Math.abs(Date.now() - event.occurredAt.getTime())).toBeLessThan(10 * 60 * 1000);
        // HTTP requests carry their id; the operational CLI identifies itself in metadata instead.
        if (event.actorType === "USER" || event.actorType === "ANONYMOUS") expect(event.requestId).not.toBeNull();
        if (event.actorType === "OPERATOR") expect(event.requestId).toBeNull();
        for (const key of Object.keys(event.metadata as object)) expect(row.metadata).toContain(key);
      }
    });

    it("003/D13 todo tipo pendente da 003 está no catálogo e ainda não é emitido pela jornada", () => {
      const types = new Set(rows.map((r) => r.type));
      for (const type of PENDING_003_TYPES) {
        expect(types.has(type), type).toBe(true);
        expect(events.some((e) => e.type === type), `${type} já é emitido: retire-o de PENDING_003_TYPES`).toBe(false);
      }
    });

    it("UPDATE em audit_events é recusado pelo trigger", async () => {
      await expect(t.prisma.$executeRawUnsafe("UPDATE audit_events SET type = 'auth.signup'")).rejects.toThrow(
        /append-only/,
      );
    });

    it("DELETE em audit_events fora do job de expurgo é recusado pelo trigger", async () => {
      const before = await t.prisma.auditEvent.count();
      await expect(t.prisma.$executeRawUnsafe("DELETE FROM audit_events")).rejects.toThrow(/append-only/);
      await expect(t.prisma.$executeRawUnsafe("TRUNCATE audit_events")).rejects.toThrow(/append-only/);
      expect(await t.prisma.auditEvent.count()).toBe(before);
    });
  });
});
