import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 025 research N2, N6 (contracts/audit-events.md, data-model "Relationships"): the discreet warning is a notice
 * from the teacher, never part of the exam's record. `exam-nudges` only reads the exam (no AI, push, mail,
 * grading, decisions, attendance or monitoring code, no write to the exam's tables); `exam-sessions` and
 * `attempt-integrity` reach it only through the pure derivation and its views; names and texts never reach the
 * audit trail or the logs; the warning's text lives only in the web (FR-017).
 */

const NUDGES_DIR = "src/modules/exam-nudges";
const NUDGES_MODULE = `${NUDGES_DIR}/exam-nudges.module.ts`;
const NUDGES_VIEWS = `${NUDGES_DIR}/views.ts`;
const NUDGES_STATUS = `${NUDGES_DIR}/nudge-status.ts`;
/** The only files of `exam-nudges` other modules may import (research N6). */
const SHARED_FILES = [NUDGES_STATUS, NUDGES_VIEWS].map((file) => file.replace(/\.ts$/, ""));
const READERS = ["src/modules/exam-sessions", "src/modules/attempt-integrity"];
const WEB_NUDGE_DIR = "../web/features/exam-nudge";
const MOBILE_ROOM_DIR = "../mobile/features/exam-room";
const CONTRACTS_SRC = "../../packages/contracts/src";
/** The warning's fixed sentence (spec FR-008); its only home is the web. */
const NUDGE_TEXT = /o professor está acompanhando suas ações/i;

function sources(dir: string, extensions = /\.ts$/): string[] {
  const absolute = join(API_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(API_ROOT, path)).isDirectory()) return sources(path, extensions);
    return extensions.test(name) ? [path] : [];
  });
}

const production = (dir: string, extensions?: RegExp) => sources(dir, extensions).filter((file) => !/\.(spec|test)\.tsx?$/.test(file));
const read = (file: string) => readFileSync(join(API_ROOT, file), "utf8");
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

/** The repository paths a file imports (relative imports resolved; packages as they are). */
function importTargets(file: string): string[] {
  return [...read(file).matchAll(IMPORT_SPECIFIER)].map(([, specifier]) =>
    specifier!.startsWith(".") ? relative(API_ROOT, resolve(join(API_ROOT, dirname(file)), specifier!)) : specifier!,
  );
}

/** The text of every call of `callee(` in `source`, parentheses balanced. */
function calls(source: string, callee: RegExp): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(callee)) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
    }
    found.push(source.slice(match.index, i));
  }
  return found;
}

/** Modules `exam-nudges` never imports: AI, help, push, alerts, mail, grading, decisions, attendance, monitoring. */
const FORBIDDEN_MODULE = [
  /^src\/modules\/ai(\/|$)/,
  /^src\/modules\/[a-z-]+-ai(\/|$)/,
  /^src\/modules\/work-help(\/|$)/,
  /^src\/platform\/push(\/|$)/,
  /^src\/modules\/exam-alerts(\/|$)/,
  /^src\/platform\/mail(\/|$)/,
  /^src\/modules\/activities\/submission(\/|$)/,
  /^src\/modules\/works\/grading(\/|$)/,
  /^src\/modules\/exam-sessions\/exam-holds/,
  /^src\/modules\/attendance(\/|$)/,
  /^src\/modules\/attempt-integrity(\/|$)/,
];

/** Writes `exam-nudges` never does: Prisma writes or SQL on the exam's own tables. */
const EXAM_WRITE = [
  /\b(examOccurrence|examAttemptHold|attemptPause|activitySubmission|activityAttempt|attemptIntegrityEvent)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/,
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(exam_occurrences|exam_attempt_holds|attempt_pauses|activity_submissions|activity_attempts|attempt_integrity_events)\b/i,
];

const AUDIT_CALL = /\b(?:this\.)?audit\.record\(/g;
const LOG_CALL = /\b(?:this\.)?logger\.(?:log|warn|error|debug|info|verbose|fatal)\(/g;
/** An object key (after `{` or `,`) that would carry a name or a text. */
const SENSITIVE_FIELD = /[{,]\s*(name|studentName|text|message)\s*[:,}]/;
const FORBIDDEN_WORDS = /\b(fraude|cola|viola[çc][ãa]o)\b/i;

describe("025 fronteira do aviso discreto: o aviso só lê a prova", () => {
  it("o módulo exam-nudges existe com a derivação e as visões", () => {
    for (const file of [NUDGES_MODULE, NUDGES_VIEWS, NUDGES_STATUS]) expect(existsSync(join(API_ROOT, file)), file).toBe(true);
  });

  it("025/FR-013 exam-nudges não importa IA, ajuda, push, alertas, e-mail, correção, decisões, chamada nem monitoramento", () => {
    const offenders = production(NUDGES_DIR).flatMap((file) =>
      importTargets(file)
        .filter((target) => FORBIDDEN_MODULE.some((pattern) => pattern.test(target)))
        .map((target) => `${file} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("025/FR-013 exam-nudges nunca escreve nas tabelas da prova", () => {
    const offenders = production(NUDGES_DIR).flatMap((file) => {
      const text = withoutComments(read(file));
      return EXAM_WRITE.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it("a guarda de escrita reconhece uma escrita proibida e aceita uma leitura", () => {
    expect(EXAM_WRITE.some((pattern) => pattern.test("await tx.examOccurrence.create({ data })"))).toBe(true);
    expect(EXAM_WRITE.some((pattern) => pattern.test('UPDATE "attempt_pauses" SET released_at'))).toBe(true);
    expect(EXAM_WRITE.some((pattern) => pattern.test("await tx.activityAttempt.findFirst({ where })"))).toBe(false);
  });

  it("025 exam-sessions e attempt-integrity importam de exam-nudges só nudge-status e views", () => {
    const offenders = READERS.flatMap((dir) => production(dir)).flatMap((file) =>
      importTargets(file)
        .filter((target) => target.startsWith(NUDGES_DIR) && !SHARED_FILES.includes(target.replace(/\.js$/, "")))
        .map((target) => `${file} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("025 auditoria, logs e textos do aviso", () => {
  it("nenhuma chamada de auditoria ou de log de exam-nudges leva nome ou texto", () => {
    const offenders = production(NUDGES_DIR).flatMap((file) => {
      const text = withoutComments(read(file));
      return [...calls(text, AUDIT_CALL), ...calls(text, LOG_CALL)]
        .filter((call) => SENSITIVE_FIELD.test(call.replace(/^[^(]*\(/, "").replace(/"[^"]*"\s*\)?$/, "")))
        .map((call) => `${file}: ${call.slice(0, 120)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("a guarda de campos reconhece um campo proibido e aceita ids", () => {
    const probe = (call: string) => SENSITIVE_FIELD.test(call);
    expect(probe("{ nudgeId, studentName }")).toBe(true);
    expect(probe("{ message: text }")).toBe(true);
    expect(probe("{ nudgeId, attemptId, activityId }")).toBe(false);
    expect(probe('{ errorName: error instanceof Error ? error.name : "unknown" }')).toBe(false);
  });

  it('025/SC-006 nenhum texto do aviso no web nem da sala no celular diz "fraude", "cola" ou "violação"', () => {
    const files = [...production(WEB_NUDGE_DIR, /\.tsx?$/), ...production(MOBILE_ROOM_DIR, /\.tsx?$/)];
    const offenders = files.filter((file) => FORBIDDEN_WORDS.test(withoutComments(read(file))));
    expect(offenders).toEqual([]);
    expect(FORBIDDEN_WORDS.test("isso é cola")).toBe(true);
    expect(FORBIDDEN_WORDS.test("a escola")).toBe(false);
  });

  it("025/FR-017 o texto do aviso não aparece na API nem nos contratos: só o web o tem", () => {
    const offenders = [...production("src"), ...production(CONTRACTS_SRC)].filter((file) => NUDGE_TEXT.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
