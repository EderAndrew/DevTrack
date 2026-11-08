import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 024/FR-010 (research Y4): the app has no decision. Its API layers (`features/<feature>/api`) call only the
 * routes of the app's allowlist; nothing reaches the hold decisions, attendance, pauses or a release.
 * 025/FR-007 (spec "Emenda à 024"): the bell's discreet warning is the app's only write about the exam.
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
  // 025: a única escrita do app (spec Emenda à 024).
  /^\/classes\/\$\{classId\}\/activities\/\$\{activityId\}\/attempts\/\$\{attemptId\}\/exam-nudges$/,
];

/**
 * The app's writes (POST/PUT/DELETE): its session, its phone, the exam mute and the warning; nothing else. The
 * session's own sign-in and sign-out, the device and the mute are 024's; the warning is 025's.
 */
const WRITES = [
  "POST /auth/mobile/sessions",
  "DELETE /auth/mobile/sessions/current",
  "PUT /mobile/device",
  "PUT /classes/${classId}/activities/${activityId}/exam-alerts",
  "POST /classes/${classId}/activities/${activityId}/attempts/${attemptId}/exam-nudges",
];

/** `request("GET", "/path"` or a template path; written as a string so the backtick needs no escaping. */
const REQUEST_PATH = new RegExp('request\\(\\s*"(?:GET|POST|PUT|DELETE)"\\s*,\\s*["\u0060]([^"\u0060]+)["\u0060]', "g");
/** The same, keeping the method. */
const REQUEST_WITH_METHOD = new RegExp('request\\(\\s*"(GET|POST|PUT|DELETE)"\\s*,\\s*["\u0060]([^"\u0060]+)["\u0060]', "g");

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

describe("024/FR-010 025/FR-007 o aplicativo não decide nada", () => {
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

  it("025/FR-007 nenhuma outra escrita além de sessão, celular, silenciar e aviso", () => {
    const writes = apiFiles().flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(REQUEST_WITH_METHOD)].map((match) => `${match[1]} ${match[2]}`).filter((call) => !call.startsWith("GET ")),
    );
    expect([...new Set(writes)].sort()).toEqual([...WRITES].sort());
  });

  it("nenhuma camada api cita decisões, chamada, pausas ou liberação", () => {
    const offenders = apiFiles().filter((file) => /exam-holds|attendance|pauses?\b|\/release|\/students\//.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(FEATURES, file))).toEqual([]);
  });
});
