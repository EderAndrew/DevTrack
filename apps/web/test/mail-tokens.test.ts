// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 017 research N9: the e-mails carry the light-theme colours of the Design System inline. The API
// keeps its own copy (`mail-tokens.ts`, no import between apps), so this test reads both files as
// text and holds the copy to `tokens.css`.

const TOKENS_URL = new URL("../design-system/tokens.css", import.meta.url);
const MAIL_TOKENS_URL = new URL("../../api/src/platform/mail/templates/mail-tokens.ts", import.meta.url);

const css = readFileSync(TOKENS_URL, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const lightBlock = (() => {
  const start = css.search(/:root\s*\{/);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
})();
const light = Object.fromEntries([...lightBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

const mailSource = readFileSync(MAIL_TOKENS_URL, "utf8");
const mail = Object.fromEntries([...mailSource.matchAll(/^\s*(\w+):\s*"(#[0-9a-fA-F]{6})",/gm)].map((m) => [m[1]!, m[2]!]));

/** Each colour of the e-mails and the light-theme token it copies. */
const COPIES: Record<string, string> = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  foreground: "--foreground",
  textSecondary: "--text-secondary",
  background: "--background",
  surface: "--surface",
  border: "--border",
};

describe("017/FR-022 cores dos e-mails", () => {
  it.each(Object.entries(COPIES))("mail-tokens.ts %s é o %s do tema claro de tokens.css", (key, token) => {
    expect(light[token], token).toMatch(/^#[0-9a-f]{6}$/i);
    expect(mail[key]?.toLowerCase(), key).toBe(light[token]!.toLowerCase());
  });

  it("mail-tokens.ts não tem cor fora da lista", () => {
    expect(Object.keys(mail).sort()).toEqual(Object.keys(COPIES).sort());
  });
});
