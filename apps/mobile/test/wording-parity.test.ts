import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 024/FR-007 024/FR-009 (research Y10): the phone says exactly what the computer says. Every text of the
 * web's exam room catalog (apps/web/features/exam-session/schemas/exam-session.ts) — each fixed string and
 * each template — appears verbatim in the app's copy (features/exam-room/schemas/exam-room.ts).
 */
const WEB = join(__dirname, "../../web/features/exam-session/schemas/exam-session.ts");
const MOBILE = join(__dirname, "../features/exam-room/schemas/exam-room.ts");

const withoutCommentsAndImports = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^import .*$/gm, "");

/** The string literals and template literals of a source, as written. */
function texts(source: string): string[] {
  const code = withoutCommentsAndImports(source);
  return [...code.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2]!).filter((text) => /[A-Za-zÀ-ú]/.test(text));
}

describe("024/FR-007 024/FR-009 os textos da sala no celular são os da web", () => {
  const web = readFileSync(WEB, "utf8");
  const mobile = readFileSync(MOBILE, "utf8");

  it("o catálogo da web tem textos para comparar", () => {
    expect(texts(web).length).toBeGreaterThan(20);
    expect(texts(web)).toContain("Encerrada por avisos — aguardando decisão");
  });

  it("cada texto da web existe igual no app", () => {
    const appTexts = new Set(texts(mobile));
    expect(texts(web).filter((text) => !appTexts.has(text))).toEqual([]);
  });
});
