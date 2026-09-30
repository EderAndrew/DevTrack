import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditEvent } from "../../src/generated/prisma/client";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { AUDIT_EVENT_METADATA } from "../../src/modules/audit/audit-event-types";
import { API_ROOT } from "../helpers/env";
import { runFullJourney } from "../helpers/journey";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createWorkAiApp } from "../helpers/work-ai";

/** Audit catalogues of every feature; the service's catalogue is their union (003 D13). */
const CONTRACTS = [
  resolve(API_ROOT, "../../specs/001-foundation-identity-access/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/003-class-invitations-enrollment/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/004-syllabus-planning/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/006-ai-foundation/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/007-curriculum-agent/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/010-exercise-bank/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/011-work-bank/contracts/audit-events.md"),
];

/**
 * 010 types whose flows arrive with later user stories (tasks.md); each leaves this list with the
 * story that emits it.
 */
const PENDING_010 = new Set<string>([]);

/** 011 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_011 = new Set<string>([
  "work.archived",
  "work.restored",
]);
const PENDING = new Set([...PENDING_010, ...PENDING_011]);

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
 * to two rows. The "Tipos aposentados" table (003) is not part of the catalogue. 006 has an extra
 * "Spec name" column after the type, dropped here.
 */
function contractRows(file: string): ContractRow[] {
  const text = readFileSync(file, "utf8").split(/^## Tipos aposentados/m)[0]!;
  const hasSpecName = /^\| `type` \| Spec name \|/m.test(text) || /^\| Type \| Name in the request \|/m.test(text);
  return text
    .split("\n")
    .filter((line) => /^\| `[a-z_]+\.[a-z_.]+`/.test(line))
    .flatMap((line) => {
      const cells = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());
      const [typeCell, actorCell, targetCell, metadataCell] = hasSpecName ? [cells[0], ...cells.slice(2)] : cells;
      const actors = actorCell!.split(/\\\|/).map((a) => a.trim());
      const target = targetCell === "—" ? null : targetCell!;
      // Allowed keys are the backticked words outside parentheses (those list values).
      const metadata = backticked(metadataCell!.replace(/\([^)]*\)/g, ""));
      return backticked(typeCell!).map((type) => ({ type, actors, target, metadata }));
    });
}

/** Types of the "Tipos aposentados" tables: no longer written, so outside the catalogue (003 D13). */
function retiredTypes(file: string): string[] {
  const [, retired = ""] = readFileSync(file, "utf8").split(/^## Tipos aposentados/m);
  const table = retired.split(/^## /m)[0]!;
  return table
    .split("\n")
    .filter((line) => /^\| `[a-z_]+\.[a-z_.]+`/.test(line))
    .flatMap((line) => backticked(line.split("|")[1]!));
}

describe("SC-008 — trilha de auditoria (FR-070, FR-071, critério 25)", () => {
  const retired = new Set(CONTRACTS.flatMap(retiredTypes));
  const rows = CONTRACTS.flatMap(contractRows).filter((row) => !retired.has(row.type) && !PENDING.has(row.type));

  it("010 e 011 tipos pendentes ainda não estão no catálogo (remova-os da lista quando a história chegar)", () => {
    expect([...PENDING].filter((type) => type in AUDIT_EVENT_METADATA)).toEqual([]);
    expect([...PENDING].filter((type) => !CONTRACTS.flatMap(contractRows).some((row) => row.type === type))).toEqual([]);
  });

  it("003/FR-048 os tipos aposentados saem do catálogo", () => {
    expect([...retired]).toEqual(["auth.signup"]);
    for (const type of retired) expect(Object.keys(AUDIT_EVENT_METADATA)).not.toContain(type);
  });

  it("o contrato e o catálogo do AuditService listam os mesmos tipos e as mesmas chaves de metadata", () => {
    expect(rows.length).toBeGreaterThanOrEqual(28 + 11 + 17 + 19 + 2);
    expect(new Set(rows.map((r) => r.type)).size).toBe(rows.length);
    const contract = Object.fromEntries(rows.map((r) => [r.type, [...r.metadata].sort()]));
    const catalogue = Object.fromEntries(
      Object.entries(AUDIT_EVENT_METADATA).map(([type, keys]) => [type, [...keys].sort()]),
    );
    expect(catalogue).toEqual(contract);
  });

  describe("cada tipo do contrato é gravado pelos fluxos da feature", () => {
    let t: AiTestApp;
    let events: AuditEvent[];

    beforeAll(async () => {
      t = await createWorkAiApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
      await resetAiDb(t);
      await runFullJourney(t);
      events = await t.prisma.auditEvent.findMany({ orderBy: { id: "asc" } });
    });
    afterAll(() => t.close());

    it.each(rows.map((row) => [row.type, row] as const))("003/SC-009 %s: ator, alvo, data, requestId e metadata", (type, row) => {
      const found = events.filter((e) => e.type === type);
      expect(found.length, `nenhum evento ${type}`).toBeGreaterThan(0);

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
