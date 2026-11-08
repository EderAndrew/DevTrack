import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 024/FR-010 (research Y4): the app has no decision. Its API layers (`features/<feature>/api`) call only the
 * routes of the app's allowlist; nothing reaches the hold decisions, attendance, pauses or a release.
 */
const FEATURES = join(__dirname, "../features");

const ALLOWED = [
  /^\/auth\/mobile\/sessions(\/current)?$/,
  /^\/me$/,
  /^\/mobile\/device$/,
  /^\/mobile\/exams$/,
  /^\/classes\/\$\{classId\}\/activities\/\$\{activityId\}\/exam-monitor$/,
  /^\/classes\/\$\{classId\}\/activities\/\$\{activityId\}\/attempts\/\$\{attemptId\}\/integrity$/,
  /^\/classes\/\$\{classId\}\/activities\/\$\{activityId\}\/exam-alerts$/,
];

/** `request("GET", "/path"` or a template path; written as a string so the backtick needs no escaping. */
const REQUEST_PATH = new RegExp('request\\(\\s*"(?:GET|POST|PUT|DELETE)"\\s*,\\s*["\u0060]([^"\u0060]+)["\u0060]', "g");

function apiFiles(): string[] {
  return readdirSync(FEATURES).flatMap((feature) => {
    const dir = join(FEATURES, feature, "api");
    try {
      if (!statSync(dir).isDirectory()) return [];
    } catch {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name))
      .map((name) => join(dir, name));
  });
}

describe("024/FR-010 o aplicativo não decide nada", () => {
  it("as camadas api do app só chamam rotas da lista do aplicativo", () => {
    const paths = apiFiles().flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(REQUEST_PATH)].map((match) => ({
        file: relative(FEATURES, file),
        path: match[1]!,
      })),
    );
    expect(paths.length).toBeGreaterThanOrEqual(6);
    expect(paths.filter(({ path }) => !ALLOWED.some((pattern) => pattern.test(path)))).toEqual([]);
  });

  it("nenhuma camada api cita decisões, chamada, pausas ou liberação", () => {
    const offenders = apiFiles().filter((file) => /exam-holds|attendance|pauses?\b|\/release|\/students\//.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(FEATURES, file))).toEqual([]);
  });
});
