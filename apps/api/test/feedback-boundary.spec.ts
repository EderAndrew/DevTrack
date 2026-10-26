import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_EVENT_METADATA } from "../src/modules/audit/audit-event-types";
import { API_ROOT } from "./helpers/env";

/**
 * 020 research J10, FR-014, SC-004: a feedback is between the student and the platform ADMIN. The
 * `student-feedback` module (API) and `features/feedback` (web) import no AI, AI help, mail, grading,
 * points, ranking, bank or activity code; the `student_feedback.*` audit types allow no key for the
 * message or the origin path, and no audit or log call of the module carries them.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const FEEDBACK_API = ["apps/api/src/modules/student-feedback"];
const FEEDBACK_WEB = ["apps/web/features/feedback"];
const FORBIDDEN_API = [
  "apps/api/src/modules/ai",
  "apps/api/src/modules/curriculum-ai",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/exam-ai",
  "apps/api/src/modules/work-help",
  "apps/api/src/platform/mail",
  "apps/api/src/modules/activities",
  "apps/api/src/modules/student-activities",
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/works",
  "apps/api/src/modules/exams",
  "apps/api/src/modules/exam-sessions",
  "apps/api/src/modules/ranking",
  "apps/api/src/modules/code-runs",
];
const FORBIDDEN_WEB = [
  "apps/web/features/ai",
  "apps/web/features/ai-operations",
  "apps/web/features/curriculum-ai",
  "apps/web/features/work-help",
  "apps/web/features/activities",
  "apps/web/features/student-activities",
  "apps/web/features/exercises",
  "apps/web/features/works",
  "apps/web/features/exams",
  "apps/web/features/exam-attempt",
  "apps/web/features/exam-session",
  "apps/web/features/ranking",
  "apps/web/features/code-run",
];

function sources(dir: string): string[] {
  const absolute = join(REPO_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(REPO_ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const production = (dirs: readonly string[]) => dirs.flatMap(sources).filter((file) => !/\.(spec|test)\.tsx?$/.test(file));
const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier));
  if (specifier.startsWith("@/") && file.startsWith("apps/web/")) return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) => dirs.some((dir) => path === dir || path.startsWith(dir + sep) || path.startsWith(`${dir}/`));

function forbiddenImports(file: string, text: string, to: readonly string[]): string[] {
  return [...text.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => {
      const target = importTarget(file, specifier);
      return target !== null && inside(target, to);
    })
    .map((specifier) => `${file}: ${specifier}`);
}

const importsInto = (from: readonly string[], to: readonly string[]) => production(from).flatMap((file) => forbiddenImports(file, read(file), to));

/** The feedback's content: never an audit metadata key nor in a log line (FR-014, SC-004). */
const CONTENT_KEY = /^(message|text|excerpt|originPath|origin_path)$/;
const CONTENT = /\b(message|text|excerpt|originPath|origin_path)\b/;

const contentKeys = (metadata: Record<string, readonly string[]>) =>
  Object.entries(metadata)
    .filter(([type]) => type.startsWith("student_feedback."))
    .flatMap(([type, keys]) => keys.filter((key) => CONTENT_KEY.test(key)).map((key) => `${type}: ${key}`));

/** An audit record or a log call, up to its matching parenthesis. */
const SINK = /\b(?:audit\.record|logger\.(?:log|warn|error|debug|verbose|fatal|info)|console\.(?:log|warn|error|info|debug))\s*\(/g;

function contentInSinks(file: string, text: string): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(SINK)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
      const char = text[end]!;
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      end += 1;
    }
    const args = text.slice(start, end - 1);
    if (CONTENT.test(args)) offenders.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
  }
  return offenders;
}

describe("020/FR-014 fronteiras do feedback dos alunos (research J10)", () => {
  it("varre o módulo da API", () => {
    expect(sources(FEEDBACK_API[0]!)).toContain("apps/api/src/modules/student-feedback/student-feedback.module.ts");
  });

  it("020/FR-014 a API do feedback não importa IA, ajuda de IA, e-mail, atividades, bancos, provas, ranking nem Code Runner", () => {
    expect(importsInto(FEEDBACK_API, FORBIDDEN_API)).toEqual([]);
  });

  it("020/FR-014 o web do feedback não importa IA, ajuda de IA, atividades, bancos, provas, ranking nem Code Runner", () => {
    expect(importsInto(FEEDBACK_WEB, FORBIDDEN_WEB)).toEqual([]);
  });

  it("020/FR-014 os tipos student_feedback.* da auditoria não têm chave para a mensagem, o trecho nem a tela", () => {
    expect(contentKeys(AUDIT_EVENT_METADATA)).toEqual([]);
  });

  it("020/FR-014 nenhuma chamada de auditoria ou log do módulo leva a mensagem ou a tela", () => {
    const files = production([...FEEDBACK_API, ...FEEDBACK_WEB]);
    expect(files.flatMap((file) => contentInSinks(file, read(file)))).toEqual([]);
  });

  it("controle: cada varredura acha o padrão proibido num exemplo", () => {
    const file = "apps/api/src/modules/student-feedback/sample.ts";
    const sample = [
      'import { AiExecutionsService } from "../ai/executions/ai-executions.service";',
      'import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";',
      'import { rankClass } from "../ranking/rank";',
      'import { canTransition } from "./feedback-state";',
      'this.audit.record(tx, { type: "student_feedback.created", metadata: { category, originPath } });',
      'this.logger.warn({ feedbackId, message: body.message }, "student_feedback.failed");',
      'this.logger.log({ feedbackId, status }, "student_feedback.status_changed");',
    ].join("\n");
    expect(forbiddenImports(file, sample, FORBIDDEN_API)).toEqual([
      `${file}: ../ai/executions/ai-executions.service`,
      `${file}: ../../platform/mail/outbox/mail-outbox`,
      `${file}: ../ranking/rank`,
    ]);
    expect(contentInSinks(file, sample)).toEqual([`${file}:5`, `${file}:6`]);
    expect(contentKeys({ "student_feedback.created": ["category", "originPath"], "other.event": ["message"] })).toEqual([
      "student_feedback.created: originPath",
    ]);
    expect(importTarget("apps/web/features/feedback/components/feedback-dialog.tsx", "@/features/work-help/api")).toBe("apps/web/features/work-help/api");
  });
});
