import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OCCURRENCE_LABELS, warningText } from "@/components/ui/assessment/warning-dialog";
import { ERROR_MESSAGES } from "@/lib/messages/error-messages";

// 018/FR-032, 018/US4-8: no text the student or the teacher reads about an exam — the warnings, the
// hold, the time and the refusals — calls it fraud, cheating ("cola") or a violation. The API guard
// (`apps/api/test/exams-boundary.spec.ts`) scans the exam features; this one also covers the Exam
// Mode components the exam uses and the exam's error messages.

const WEB_ROOT = resolve(__dirname, "..");
const SCANNED = [
  "features/exam-attempt",
  // The teacher's screens (018/FR-032): the exam room, its decisions and occurrences, and the bank.
  "features/exam-session",
  "features/exams",
  "components/ui/assessment/warning-dialog.tsx",
  "components/ui/assessment/exam-timer.tsx",
  "components/ui/assessment/time-alert.tsx",
  "components/ui/assessment/final-countdown.tsx",
  // 023/FR-026: a group work's facts are facts, in the same words.
  "features/group-work",
  "features/activities/components/group-facts.tsx",
];
const LABELS = [/\bfraud/i, /\bfraude/i, /\bcola\b/i, /viola[cç][aã]o/i, /\bcheat/i];

function files(path: string): string[] {
  const full = join(WEB_ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const production = () => SCANNED.flatMap(files).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

describe("018/FR-032 os textos da prova não falam em fraude, cola ou violação", () => {
  it("018/US4-8 avisos, encerramento, tempo, páginas da prova e telas do professor", () => {
    expect(production().length).toBeGreaterThanOrEqual(SCANNED.length);
    const offending = production().flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        // Comments may name the rule itself ("no text names fraud"); only code and strings are scanned.
        .flatMap((line, index) =>
          !/^\s*(\/\/|\/?\*)/.test(line) && LABELS.some((label) => label.test(line)) ? [`${relative(WEB_ROOT, file)}:${index + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(offending).toEqual([]);
  });

  it("018/US4-8 os textos dos avisos e as mensagens de erro da prova", () => {
    const texts = [
      ...Object.values(OCCURRENCE_LABELS),
      ...([1, 2, 3] as const).flatMap((n) => Object.keys(OCCURRENCE_LABELS).map((kind) => warningText(n, kind as keyof typeof OCCURRENCE_LABELS))),
      ...Object.entries(ERROR_MESSAGES)
        .filter(([code]) => code.startsWith("EXAM_") || code === "EXIT_NOT_ALLOWED")
        .map(([, message]) => message),
    ];
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) for (const label of LABELS) expect(text, text).not.toMatch(label);
  });

  it("controle: a varredura acha o proibido e deixa passar o neutro", () => {
    for (const line of ['title: "Fraude detectada"', "Você colou: cola proibida", "Violação de regra"]) {
      expect(LABELS.some((label) => label.test(line)), line).toBe(true);
    }
    for (const line of ["Colar não é permitido na prova", "colagem bloqueada", "Você saiu da tela da prova"]) {
      expect(LABELS.some((label) => label.test(line)), line).toBe(false);
    }
  });
});
