import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditEvent } from "../../src/generated/prisma/client";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { AUDIT_EVENT_METADATA } from "../../src/modules/audit/audit-event-types";
import { API_ROOT } from "../helpers/env";
import { runFullJourney } from "../helpers/journey";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createWorkHelpApp } from "../helpers/work-help";

/** Audit catalogues of every feature; the service's catalogue is their union (003 D13). */
const CONTRACTS = [
  resolve(API_ROOT, "../../specs/001-foundation-identity-access/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/003-class-invitations-enrollment/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/004-syllabus-planning/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/006-ai-foundation/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/007-curriculum-agent/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/010-exercise-bank/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/011-work-bank/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/012-student-portal/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/013-exercise-points-ranking/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/015-controlled-work-ai-help/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/016-attendance-gated-release/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/017-production-email/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/018-controlled-exams/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/019-exercise-code-runner/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/020-student-feedback/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/021-work-code-runner/contracts/audit-events.md"),
  resolve(API_ROOT, "../../specs/023-group-work/contracts/audit-events.md"),
];

/**
 * 010 types whose flows arrive with later user stories (tasks.md); each leaves this list with the
 * story that emits it.
 */
const PENDING_010 = new Set<string>([]);

/** 011 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_011 = new Set<string>([]);

/** 012 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_012 = new Set<string>([]);

/** 013 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_013 = new Set<string>([]);

/** 015 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_015 = new Set<string>([]);

/** 016 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_016 = new Set<string>([]);

/** 018 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_018 = new Set<string>([]);
/** 018 "Changed" rows whose metadata arrives with later user stories; each leaves with the story that emits it. */
const PENDING_CHANGED_018 = new Set<string>([]);
/** 021 "Changed" rows whose metadata arrives with later user stories; same rule. */
const PENDING_CHANGED_021 = new Set<string>([]);
/** 023 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_023 = new Set<string>([
  "activity_group.created",
  "activity_group.member_added",
  "activity_group.editing_changed",
  "activity_group.leader_changed",
  "activity_group.write_refused",
]);
/** 023 "Changed" rows whose metadata arrives with later user stories; same rule. */
const PENDING_CHANGED_023 = new Set<string>(["activity_attempt.started", "activity_submission.created"]);
/** 019 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_019 = new Set<string>([]);
/** 020 types whose flows arrive with later user stories (tasks.md); same rule as `PENDING_010`. */
const PENDING_020 = new Set<string>([]);
const PENDING = new Set([
  ...PENDING_010,
  ...PENDING_011,
  ...PENDING_012,
  ...PENDING_013,
  ...PENDING_015,
  ...PENDING_016,
  ...PENDING_018,
  ...PENDING_019,
  ...PENDING_020,
  ...PENDING_023,
]);

interface ContractRow {
  type: string;
  actors: string[];
  /** null = "—" (no target); several when the event targets the resource it was about (012). */
  target: string[] | null;
  metadata: string[];
}

const backticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

/**
 * Rows of the event table of one contracts/audit-events.md; `a` / `b` in the type column expands
 * to two rows. The "Tipos aposentados" table (003) is not part of the catalogue. 006 has an extra
 * "Spec name" column after the type, dropped here.
 */
function contractRows(file: string): ContractRow[] {
  // 018's and 019's "Changed" tables (two columns) list metadata their stories add to earlier types;
  // each row joins the earlier type's row with the story that emits it (`changedRows`).
  const [text = "", changed = ""] = readFileSync(file, "utf8").split(/^## Tipos aposentados/m)[0]!.split(/^## Changed/m);
  // 023 shares changed types with 018 (`activity_attempt.started`), so its pending rows are skipped only in its own file.
  return [...eventRows(text), ...changedRows(changed, file.includes("/023-") ? PENDING_CHANGED_023 : new Set())];
}

/**
 * The 018 "Changed" rows whose story has arrived: the earlier type with the keys it adds
 * (`type: EXAM` names the existing key `type`). Its actors and target stay the earlier row's.
 */
function changedRows(table: string, pendingHere: ReadonlySet<string>): ContractRow[] {
  return table
    .split("\n")
    .filter((line) => /^\| `[a-z_]+\.[a-z_.]+`/.test(line))
    .flatMap((line) => {
      const [typeCell, metadataCell] = line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());
      const type = backticked(typeCell!)[0]!;
      if (PENDING_CHANGED_018.has(type) || PENDING_CHANGED_021.has(type) || pendingHere.has(type)) return [];
      // Upper-case words are values of an existing key (the `code`s of `activity_submission.rejected`), not keys.
      const metadata = backticked(metadataCell!.replace(/\([^)]*\)/g, ""))
        .filter((key) => !/^[A-Z_]+$/.test(key))
        .map((key) => key.split(":")[0]!.trim());
      return [{ type, actors: [], target: [], metadata }];
    });
}

function eventRows(text: string): ContractRow[] {
  const hasSpecName = /^\| `type` \| Spec name \|/m.test(text) || /^\| Type \| Name in the (request|spec) \|/m.test(text);
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
      const target = targetCell === "—" ? null : targetCell!.replace(/\([^)]*\)/g, "").split(/\\\|/).map((t) => t.trim());
      // Allowed keys are the backticked words outside parentheses (those list values).
      const metadata = backticked(metadataCell!.replace(/\([^)]*\)/g, ""));
      return backticked(typeCell!).map((type) => ({ type, actors, target, metadata }));
    });
}

/**
 * A later feature may extend an earlier type (013 adds `attemptNumber` to 012's
 * `activity_attempt.started`): its row adds actors, targets and metadata keys to the first one.
 */
function mergeExtensions(all: ContractRow[]): ContractRow[] {
  const byType = new Map<string, ContractRow>();
  for (const row of all) {
    const first = byType.get(row.type);
    if (!first) {
      byType.set(row.type, { ...row });
      continue;
    }
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
    byType.set(row.type, {
      type: row.type,
      actors: union(first.actors, row.actors),
      target: first.target && row.target ? union(first.target, row.target) : (first.target ?? row.target),
      metadata: union(first.metadata, row.metadata),
    });
  }
  return [...byType.values()];
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
  const rows = mergeExtensions(CONTRACTS.flatMap(contractRows)).filter((row) => !retired.has(row.type) && !PENDING.has(row.type));

  it("010, 011, 012, 013, 015, 016, 018, 019 e 020 tipos pendentes ainda não estão no catálogo (remova-os da lista quando a história chegar)", () => {
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
      t = await createWorkHelpApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
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
        if (row.target) expect(row.target).toContain(event.targetType);
        else expect(event.targetType).toBeNull();
        if (row.target) expect(event.targetId).not.toBeNull();
        expect(event.occurredAt).toBeInstanceOf(Date);
        expect(Math.abs(Date.now() - event.occurredAt.getTime())).toBeLessThan(10 * 60 * 1000);
        // HTTP requests carry their id; the operational CLI identifies itself in metadata instead.
        if (event.actorType === "USER" || event.actorType === "ANONYMOUS") expect(event.requestId).not.toBeNull();
        if (event.actorType === "OPERATOR") expect(event.requestId).toBeNull();
        for (const key of Object.keys(event.metadata as object)) expect(row.metadata).toContain(key);
      }
    });

    /**
     * Metadata values that are not ids, integers, booleans, one-word codes (enum values, error
     * codes, field names, catalog keys) or, when `routes`, route patterns such as
     * `/me/activities/:activityId`: never free text.
     */
    const offendingMetadata = (found: AuditEvent[], routes = false) => {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const code = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
      const route = /^(\/:?[a-z][A-Za-z-]*)+$/;
      const offending: string[] = [];
      const visit = (type: string, path: string, value: unknown) => {
        if (value === null || typeof value === "boolean" || Number.isInteger(value)) return;
        if (typeof value === "string" && (uuid.test(value) || code.test(value) || (routes && route.test(value)))) return;
        if (Array.isArray(value)) return value.forEach((item, index) => visit(type, `${path}[${index}]`, item));
        if (typeof value === "object") return Object.entries(value).forEach(([key, item]) => visit(type, `${path}.${key}`, item));
        offending.push(`${type} ${path}: ${JSON.stringify(value)}`);
      };
      for (const event of found) visit(event.type, "metadata", event.metadata);
      return offending;
    };

    it("011 work.* e work_generation.*: os 7 tipos gravados, metadata só com ids, contagens, enums e códigos", () => {
      const types = rows.map((row) => row.type).filter((type) => /^work(_generation)?\./.test(type));
      expect(types.sort()).toEqual(
        ["work.approved", "work.archived", "work.created", "work.edited", "work.restored", "work_generation.generated", "work_generation.requested"],
      );
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(7);
      expect(offendingMetadata(found)).toEqual([]);
    });

    it("012/SC-011 os 13 tipos da 012 gravados, metadata só com ids, contagens, enums, booleanos e códigos", () => {
      const types = rows
        .map((row) => row.type)
        .filter((type) => /^(activity|activity_attempt|activity_submission|activity_result|student_access)\./.test(type) && type !== "activity.settings_changed");
      expect(types.sort()).toEqual([
        "activity.cancelled",
        "activity.closed",
        "activity.published",
        "activity.updated",
        "activity_attempt.progress_saved",
        "activity_attempt.started",
        "activity_result.released",
        "activity_result.viewed",
        "activity_submission.accepted_by_teacher",
        "activity_submission.created",
        "activity_submission.graded",
        "activity_submission.rejected",
        "student_access.denied",
      ]);
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(13);
      expect(offendingMetadata(found, true)).toEqual([]);
    });

    it("013/SC-009 os 2 tipos da 013 gravados e as extensões da 012, metadata só com ids, contagens, enums, booleanos e códigos; ler o ranking não é auditado", () => {
      const types = rows.map((row) => row.type).filter((type) => /^exercise_(attempt|result)\./.test(type));
      expect(types.sort()).toEqual(["exercise_attempt.completed", "exercise_result.marked"]);
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(2);
      expect(offendingMetadata(found)).toEqual([]);
      const completed = found.filter((event) => event.type === "exercise_attempt.completed").map((event) => event.metadata as Record<string, unknown>);
      expect(completed.map((metadata) => [metadata.attemptNumber, metadata.first])).toContainEqual([1, true]);
      expect(found.find((event) => event.type === "exercise_result.marked")?.metadata).toMatchObject({ from: "PENDING_TEACHER", to: "CORRECT", hasComment: true });
      // 012 types extended by 013 (contracts/audit-events.md).
      const started = events.filter((event) => event.type === "activity_attempt.started").map((event) => (event.metadata as { attemptNumber?: number }).attemptNumber);
      expect(started).toContain(2);
      const published = events.filter((event) => event.type === "activity.published").map((event) => event.metadata as Record<string, unknown>);
      expect(published.some((metadata) => Number.isInteger(metadata.possiblePoints) && !("totalCents" in metadata) && !("latePolicy" in metadata))).toBe(true);
      expect(events.filter((event) => /ranking/i.test(event.type) || /ranking/i.test(JSON.stringify(event.metadata)))).toEqual([]);
    });

    it("015/US1-4 activity.settings_changed com o modo e a ajuda; activity.published com a ajuda, só enums e contagens", () => {
      const changed = events.filter((event) => event.type === "activity.settings_changed");
      expect(changed.map((event) => event.metadata)).toContainEqual(expect.objectContaining({ executionMode: "CONTROLLED", aiHelpAllowance: 0 }));
      expect(offendingMetadata(changed)).toEqual([]);
      const published = events.filter((event) => event.type === "activity.published").map((event) => event.metadata as Record<string, unknown>);
      expect(published.every((metadata) => metadata.aiHelpAllowance === 0 || metadata.aiHelpAllowance === 3)).toBe(true);
    });

    it("015/SC-010 cada evento da tentativa e cada pedido de ajuda gera exatamente um evento de auditoria, sem conteúdo", async () => {
      const stored = await t.prisma.attemptIntegrityEvent.findMany({ select: { attemptId: true, type: true } });
      const recorded = events.filter((event) => event.type === "attempt_integrity.recorded");
      expect(stored.map((row) => row.type)).toEqual(expect.arrayContaining(["SCREEN_LEFT", "SCREEN_RETURNED", "PASTE_BLOCKED", "TYPING_LIMIT_EXCEEDED"]));
      // One per stored event (the resend of the same events recorded nothing), on the event's attempt.
      const key = (attemptId: string | null, type: string) => `${attemptId} ${type}`;
      expect(recorded.map((event) => key(event.targetId, (event.metadata as { eventType: string }).eventType)).sort()).toEqual(
        stored.map((row) => key(row.attemptId, row.type)).sort(),
      );
      // The server's own record of a refused save is SYSTEM; the browser's events are the student's.
      expect(recorded.filter((event) => (event.metadata as { eventType: string }).eventType === "TYPING_LIMIT_EXCEEDED").map((event) => event.actorType)).toEqual(["SYSTEM"]);
      const helps = await t.prisma.workHelpRequest.findMany({ select: { id: true, status: true } });
      expect(helps.map((help) => help.status).sort()).toEqual(["BLOCKED", "DELIVERED", "FAILED", "OUT_OF_SCOPE"]);
      expect(events.filter((event) => event.type === "work_help.requested").map((event) => event.targetId).sort()).toEqual(helps.map((help) => help.id).sort());
      const settled = events.filter((event) => /^work_help\.(delivered|out_of_scope|blocked|failed)$/.test(event.type));
      expect(settled.map((event) => event.targetId).sort()).toEqual(helps.map((help) => help.id).sort());
      const help015 = events.filter((event) => event.type.startsWith("work_help.") || event.type === "attempt_integrity.recorded");
      expect(offendingMetadata(help015)).toEqual([]);
      expect(JSON.stringify(help015.map((event) => event.metadata))).not.toMatch(/MARCADOR-(AJUDA|ORIENTACAO)-015|jornada quinze|Texto colado/);
    });

    it("016/SC-009 cada marcação, desmarcação, pausa e retorno gera exatamente um evento de auditoria, só com ids e enums, sem a nota de \"Outro\"", async () => {
      const types = rows.map((row) => row.type).filter((type) => /^(attendance|attempt_pause)\./.test(type));
      expect(types.sort()).toEqual(["attempt_pause.released", "attempt_pause.started", "attempt_pause.write_refused", "attendance.marked", "attendance.unmarked"]);
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(5);
      expect(offendingMetadata(found)).toEqual([]);
      expect(JSON.stringify(found.map((event) => event.metadata))).not.toMatch(/MARCADOR-NOTA-016|jornada/);
      // The journey marks 3 times for works, four times for the 018/US3, US4 and US5 exams and once for the
      // 021 work with code execution, and unmarks once (016/US2): one event per change, none for a no-op.
      const marked = found.filter((event) => event.type === "attendance.marked");
      const unmarked = found.filter((event) => event.type === "attendance.unmarked");
      expect([marked.length, unmarked.length]).toEqual([8, 1]);
      expect(await t.prisma.activityAttendance.count()).toBe(marked.length - unmarked.length);
      // One `started` per pause and one `released` per pause the teacher released, on the pause's attempt
      // (the 021 work's pause stays open: its run is refused).
      const pauses = await t.prisma.attemptPause.findMany({ select: { id: true, attemptId: true, initiatedBy: true, releasedAt: true } });
      expect(pauses.map((pause) => pause.initiatedBy).sort()).toEqual(["STUDENT", "STUDENT", "TEACHER"]);
      const started = found.filter((event) => event.type === "attempt_pause.started");
      expect(started.map((event) => `${event.targetId} ${(event.metadata as { pauseId: string }).pauseId}`).sort()).toEqual(
        pauses.map((pause) => `${pause.attemptId} ${pause.id}`).sort(),
      );
      const released = found.filter((event) => event.type === "attempt_pause.released").map((event) => (event.metadata as { pauseId: string }).pauseId);
      expect(released.sort()).toEqual(pauses.filter((pause) => pause.releasedAt !== null).map((pause) => pause.id).sort());
      expect(released).toHaveLength(2);
      expect(found.filter((event) => event.type === "attempt_pause.write_refused").map((event) => (event.metadata as { operation: string }).operation).sort()).toEqual(["CODE_RUN", "EVENTS", "HELP"]);
    });

    it("018/SC-010 cada encerramento por avisos, cancelamento, devolução e \"não cancelar\" gera exatamente um evento, sem enunciado nem resposta; a decisão repetida nenhum", async () => {
      const types = rows.map((row) => row.type).filter((type) => /^exam(_generation|_attempt)?\./.test(type));
      expect(types.sort()).toEqual([
        "exam.approved",
        "exam.archived",
        "exam.created",
        "exam.edited",
        "exam.restored",
        "exam_attempt.cancel_confirmed",
        "exam_attempt.held",
        "exam_attempt.not_cancelled",
        "exam_attempt.returned",
        "exam_attempt.time_expired",
        "exam_attempt.write_refused",
        "exam_generation.completed",
        "exam_generation.rejected",
        "exam_generation.requested",
      ]);
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(types.length);
      expect(offendingMetadata(found)).toEqual([]);
      // Two holds (the 4th occurrence, then the 5th after the return) on one attempt and one on the kept
      // exam; each decided once, the repeated return refused without an event.
      const holds = await t.prisma.examAttemptHold.findMany({ select: { id: true, attemptId: true } });
      const holdOf = (type: string) =>
        found.filter((event) => event.type === type).map((event) => `${event.targetId} ${(event.metadata as { holdId: string }).holdId}`).sort();
      expect(holdOf("exam_attempt.held")).toEqual(holds.map((hold) => `${hold.attemptId} ${hold.id}`).sort());
      const decided = ["exam_attempt.returned", "exam_attempt.cancel_confirmed", "exam_attempt.not_cancelled"].map((type) => holdOf(type));
      expect(decided.map((list) => list.length)).toEqual([1, 1, 1]);
      expect(new Set(decided.flat()).size).toBe(3);
      expect(found.filter((event) => event.type === "exam_attempt.held").every((event) => event.actorType === "SYSTEM")).toBe(true);
      // The 012 types extended by 018 (contracts/audit-events.md, "Changed").
      const of = (type: string) => events.filter((event) => event.type === type).map((event) => event.metadata as Record<string, unknown>);
      expect(of("activity.published")).toContainEqual(expect.objectContaining({ type: "EXAM", durationMinutes: 30 }));
      expect(of("activity_attempt.started")).toContainEqual(expect.objectContaining({ rulesAccepted: true }));
      expect(of("activity_submission.created")).toContainEqual(expect.objectContaining({ endReason: "STUDENT_SUBMITTED" }));
      expect(of("activity_submission.rejected").map((metadata) => metadata.code)).toEqual(expect.arrayContaining(["EXAM_ATTEMPT_ON_HOLD", "EXIT_NOT_ALLOWED"]));
      const exam018 = [...found, ...events.filter((event) => /^activity(_attempt|_submission)?\./.test(event.type))];
      expect(JSON.stringify(exam018.map((event) => event.metadata))).not.toMatch(/MARCADOR-PROVA-018|jornada dezoito/);
    });

    it("017/SC-007 mail_delivery.*: os 3 tipos gravados (falha, descarte, rejeição SMTP e aviso de bounce), metadata só com enums, contagens e códigos", async () => {
      const types = rows.map((row) => row.type).filter((type) => type.startsWith("mail_delivery."));
      expect(types.sort()).toEqual(["mail_delivery.discarded", "mail_delivery.failed", "mail_delivery.undelivered"]);
      const found = events.filter((event) => types.includes(event.type));
      expect(new Set(found.map((event) => event.type)).size).toBe(3);
      expect(offendingMetadata(found)).toEqual([]);
      for (const event of found) {
        expect(event.actorType).toBe("SYSTEM");
        expect(event.targetType).toBe("MAIL_DELIVERY");
        // The target is a delivery row (or its id after the retention); never an address or a Message-ID.
        expect(Object.values(event.metadata as object).every((value) => typeof value !== "string" || !/@|</.test(value))).toBe(true);
      }
      const undelivered = found.filter((event) => event.type === "mail_delivery.undelivered").map((event) => event.metadata as { source: string; reason: string });
      expect(new Set(undelivered.map((m) => `${m.source} ${m.reason}`))).toEqual(new Set(["SMTP REJECTED", "NOTICE BOUNCED"]));
      const failed = found.filter((event) => event.type === "mail_delivery.failed").map((event) => event.metadata as { attempts: number });
      expect(failed.map((m) => m.attempts)).toContain(7);
      const discarded = found.filter((event) => event.type === "mail_delivery.discarded").map((event) => (event.metadata as { reason: string }).reason);
      expect(discarded).toContain("REVOKED");
      // SENT and DELIVERED are never audited (volume; they live in the row).
      expect(events.some((event) => /^mail_delivery\.(sent|delivered)$/.test(event.type))).toBe(false);
      expect(JSON.stringify(found.map((event) => event.metadata))).not.toMatch(/MARCADOR-(DESTINO|BOUNCE)-017|jornada/);
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
