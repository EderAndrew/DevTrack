import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ExamStatusOfStudentSchema } from "@repo/contracts";
import { examStatusLabel, STATUS_TONES } from "../features/exam-room/schemas/exam-room";

/**
 * 024/US2-8 024/FR-022: no text of the app says "fraude", "cola" or "violação" (comments aside), and every
 * situation of a student is written out, never colour alone.
 */
const ROOT = join(__dirname, "..");

function files(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("024/US2-8 os textos do aplicativo", () => {
  it('024/FR-022 nenhum texto diz "fraude", "cola" ou "violação"', () => {
    const offenders = ["app", "features", "components", "lib"]
      .flatMap((dir) => files(join(ROOT, dir)))
      .filter((file) => /\b(fraude|cola|viola[çc][ãa]o)\b/i.test(withoutComments(readFileSync(file, "utf8"))))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("toda situação de aluno tem texto, e a cor só acompanha", () => {
    const monitor = { startDeadline: "2026-11-07T13:15:00.000Z", serverNow: "2026-11-07T13:05:00.000Z" };
    for (const examStatus of ExamStatusOfStudentSchema.options) {
      const row = {
        studentUserId: "00000000-0000-4000-8000-000000000101",
        name: "Aluno",
        markedAt: null,
        examStatus,
        attemptId: null,
        startedAt: null,
        endsAt: "2026-11-07T13:30:00.000Z",
        occurrenceCount: 0,
        openHold: null,
        openPause: examStatus === "PAUSED" ? ({ startedAt: "2026-11-07T13:02:00.000Z" } as never) : null,
        nudge: null,
      };
      expect({ examStatus, words: examStatusLabel(row, monitor).length > 3, tone: STATUS_TONES[examStatus] !== undefined }).toEqual({
        examStatus,
        words: true,
        tone: true,
      });
    }
  });
});
