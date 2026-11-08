import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 024 research Y5, Y6, Y13 (contracts/push-notifications.md, contracts/audit-events.md): alerts are a
 * notice of what 018 already recorded, never part of it. `attempt-integrity` reaches them only through its
 * `ExamAlertSink` hook; `exam-alerts` only reads the exam (no grading, decisions, pauses or exam writes);
 * Expo is reached only by `platform/push/expo-push.client.ts`, over `fetch`, with no push SDK; and names,
 * titles, notification texts and tokens never reach the audit trail or the logs (024/FR-016; the whole of
 * SC-005 is checked by test/security/024-audit.spec.ts).
 */

const ALERTS_DIR = "src/modules/exam-alerts";
const INTEGRITY_DIR = "src/modules/attempt-integrity";
const PUSH_DIR = "src/platform/push";
const SINK = "src/modules/attempt-integrity/exam-alert-sink.ts";
const EXPO_CLIENT = "src/platform/push/expo-push.client.ts";
/** The modules whose audit and log calls are checked for names, titles, texts and tokens. */
const SENSITIVE_CALLERS = [ALERTS_DIR, PUSH_DIR];
const MOBILE_SESSION_FILES = /^src\/modules\/auth\/mobile-session/;
/** Push SDKs (research Y6: Expo over `fetch`, like 017's SMTP with no provider SDK). */
const PUSH_PACKAGE = /^(expo-server-sdk|firebase-admin|@expo\/.*|node-pushnotifications|web-push|apn|@parse\/node-apn|node-gcm)$/;

function sources(dir: string): string[] {
  const absolute = join(API_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(API_ROOT, path)).isDirectory()) return sources(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

const production = (dir: string) => sources(dir).filter((file) => !/\.(spec|test)\.ts$/.test(file));
const read = (file: string) => readFileSync(join(API_ROOT, file), "utf8");
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

/** The repository paths a file imports (relative imports resolved; packages as they are). */
function importTargets(file: string): string[] {
  return [...read(file).matchAll(IMPORT_SPECIFIER)].map(([, specifier]) =>
    specifier!.startsWith(".") ? relative(API_ROOT, resolve(join(API_ROOT, dirname(file)), specifier!)) : specifier!,
  );
}

const packageOf = (specifier: string) =>
  specifier.startsWith(".") || specifier.startsWith("src/")
    ? null
    : specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0]!;

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

const AUDIT_CALL = /\b(?:this\.)?audit\.record\(/g;
const LOG_CALL = /\b(?:this\.)?logger\.(?:log|warn|error|debug|info|verbose|fatal)\(/g;
/** Fields that would carry a token, a name, a title or a notification text. */
/** An object key (after `{` or `,`), so `error.name` in an expression is not taken for a field. */
const SENSITIVE_FIELD = /[{,]\s*(pushToken|token|title|body|studentName|className|name|text|message)\s*[:,}]/;

/** Exam writes `exam-alerts` must never do: Prisma writes or SQL on the exam's own tables. */
const EXAM_WRITE = [
  /\b(examOccurrence|examAttemptHold|activityAttempt|activitySubmission|activityAnswer|attemptPause|attemptIntegrityEvent)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/,
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(exam_occurrences|exam_attempt_holds|activity_attempts|activity_submissions|activity_answers|attempt_pauses|attempt_integrity_events)\b/i,
];
/** Modules of grading, decisions, pauses and exam sessions. */
const FORBIDDEN_MODULES = [
  "src/modules/exam-sessions",
  "src/modules/activities/submission",
  "src/modules/attendance",
  "src/modules/works/grading",
  "src/modules/ai",
  "src/modules/work-help",
];

describe("024 fronteira dos avisos: a prova não depende dos avisos, os avisos só leem a prova", () => {
  it("024/FR-015 attempt-integrity conhece só o hook ExamAlertSink, nunca o módulo exam-alerts", () => {
    expect(existsSync(join(API_ROOT, SINK)), SINK).toBe(true);
    const offenders = production(INTEGRITY_DIR).flatMap((file) =>
      importTargets(file)
        .filter((target) => target.startsWith(ALERTS_DIR) || target.startsWith(PUSH_DIR))
        .map((target) => `${file} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("024/FR-010 exam-alerts não importa correção, decisões, pausas, sessões de prova nem IA", () => {
    const offenders = production(ALERTS_DIR).flatMap((file) =>
      importTargets(file)
        .filter((target) => FORBIDDEN_MODULES.some((module) => target.startsWith(module)))
        .map((target) => `${file} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("024/FR-015 exam-alerts nunca escreve nas tabelas da prova", () => {
    const offenders = production(ALERTS_DIR).flatMap((file) => {
      const text = withoutComments(read(file));
      return EXAM_WRITE.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it("a guarda de escrita reconhece uma escrita proibida", () => {
    expect(EXAM_WRITE.some((pattern) => pattern.test("await tx.examAttemptHold.update({ where })"))).toBe(true);
    expect(EXAM_WRITE.some((pattern) => pattern.test('UPDATE "activity_attempts" SET status'))).toBe(true);
    expect(EXAM_WRITE.some((pattern) => pattern.test("await tx.examAttemptHold.findFirst({ where })"))).toBe(false);
  });
});

describe("024 fronteira do envio: Expo só por fetch, num único arquivo", () => {
  it("o cliente do Expo existe e só ele conhece exp.host", () => {
    expect(existsSync(join(API_ROOT, EXPO_CLIENT)), EXPO_CLIENT).toBe(true);
    const offenders = production("src").filter((file) => file !== EXPO_CLIENT && /exp\.host/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("nenhum código da API importa um SDK de push", () => {
    const offenders = production("src").flatMap((file) =>
      importTargets(file)
        .map(packageOf)
        .filter((name): name is string => name !== null && PUSH_PACKAGE.test(name))
        .map((name) => `${file} → ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it("nenhum SDK de push entre as dependências da API", () => {
    const manifest = JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;
    const names = ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) => Object.keys(manifest[field] ?? {}));
    expect(names.filter((name) => PUSH_PACKAGE.test(name))).toEqual([]);
  });
});

describe("024/FR-016 auditoria e logs dos avisos e da sessão do celular só com ids, enums e códigos", () => {
  const files = [...SENSITIVE_CALLERS.flatMap(production), ...production("src/modules/auth").filter((file) => MOBILE_SESSION_FILES.test(file))];

  it("nenhuma chamada de auditoria ou de log leva token, nome, título ou texto do aviso", () => {
    const offenders = files.flatMap((file) => {
      const text = withoutComments(read(file));
      return [...calls(text, AUDIT_CALL), ...calls(text, LOG_CALL)]
        .filter((call) => SENSITIVE_FIELD.test(call.replace(/^[^(]*\(/, "").replace(/"[^"]*"\s*\)?$/, "")))
        .map((call) => `${file}: ${call.slice(0, 120)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("a guarda de campos reconhece um campo proibido e aceita ids e códigos", () => {
    const probe = (call: string) => SENSITIVE_FIELD.test(call);
    expect(probe("{ deviceId, pushToken }")).toBe(true);
    expect(probe("{ title: activity.title }")).toBe(true);
    expect(probe("{ alertId, deviceId, errorCode: 'DeviceNotRegistered' }")).toBe(false);
    expect(probe('{ errorName: error instanceof Error ? error.name : "unknown" }')).toBe(false);
    expect(probe("{ alertId, name }")).toBe(true);
  });

  it('024/FR-022 nenhum texto de aviso diz "fraude", "cola" ou "violação"', () => {
    const offenders = [...production(ALERTS_DIR), ...production(PUSH_DIR)].filter((file) =>
      /\b(fraude|cola|viola[çc][ãa]o)\b/i.test(withoutComments(read(file))),
    );
    expect(offenders).toEqual([]);
  });
});
