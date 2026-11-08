import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { meetsInvitationPasswordRules } from "@repo/contracts";
import { weakPassword } from "../../platform/http/errors";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** SecLists top-10k list shipped with the API (R4); resolves from both src/ and dist/. */
export const COMMON_PASSWORDS_PATH = resolve(__dirname, "../../../assets/common-passwords.txt");

export function loadCommonPasswords(path: string = COMMON_PASSWORDS_PATH): ReadonlySet<string> {
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
  return new Set(entries);
}

/** What the English-heavy list lacks and people here would pick (FR-011a); see assets/README.md. */
export const LOCAL_WORDS_PATH = resolve(__dirname, "../../../assets/common-words-pt-br.txt");

/** Shorter leftovers would refuse random passwords whose few letters happen to be in the big list. */
const MIN_LIST_WORD_LENGTH = 4;
const MIN_LOCAL_WORD_LENGTH = 3;
const MIN_DIGITS_LENGTH = 6;
const KEYBOARD_RUNS = ["qwert", "asdf", "zxcv", "qazwsx", "1q2w3e", "q1w2e3"];

const REPLACED_LETTERS: Readonly<Record<string, string>> = { "@": "a", $: "s", "0": "o", "3": "e", "4": "a", "5": "s", "7": "t" };

/**
 * The forms a password that meets the composition rules may hide a common one in (FR-011a): `Password1!`
 * has no entry of its own, since no entry of the list has a letter, a digit and a symbol, but it is
 * `password`. Only the FR-011a rule (invitation and reset) reads these.
 */
function commonForms(password: string): { whole: string[]; words: string[] } {
  const plain = password.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const lettersOf = (text: string) => text.replace(/\P{L}/gu, "");
  // Kept in the second stem, a final @ or $ may be a letter: `s3nh@2026` is `senha`.
  const stems = [plain.replace(/^\P{L}+|\P{L}+$/gu, ""), plain.replace(/^[^\p{L}@$]+|[^\p{L}@$]+$/gu, "")];
  const read = stems.flatMap((stem) =>
    ["i", "l"].map((one) => lettersOf(stem.replace(/[@$013457]/g, (char) => (char === "1" ? one : REPLACED_LETTERS[char]!)))),
  );
  const digits = plain.replace(/\P{Nd}/gu, "");
  return {
    // The digits alone catch `Aa123456!`, whose letters are too few to read as a word.
    whole: [plain, plain.replace(/[\p{P}\p{S}]/gu, ""), ...(digits.length >= MIN_DIGITS_LENGTH ? [digits] : [])],
    words: [lettersOf(plain), ...read].filter((word) => word.length >= MIN_LOCAL_WORD_LENGTH),
  };
}

/**
 * Password strength rule (FR-011): 12–128 characters, no composition rules, and not in the
 * common-passwords list (compared case-insensitively); since 2026-11-08 only the admin activation uses
 * it. A password chosen when accepting an invitation or in a password reset follows FR-011a instead. Only a new password is checked, never a stored one. The list
 * is loaded once at startup, so a missing file stops the API from booting instead of silently
 * accepting weak passwords. Provided through a factory in IdentityModule.
 */
export class PasswordPolicy {
  private readonly common: ReadonlySet<string>;
  private readonly localWords: ReadonlySet<string>;

  constructor(common?: ReadonlySet<string>, localWords?: ReadonlySet<string>) {
    this.common = common ?? loadCommonPasswords();
    this.localWords = localWords ?? loadCommonPasswords(LOCAL_WORDS_PATH);
  }

  isAcceptable(password: string): boolean {
    // Length in code points, so a character outside the BMP counts once.
    const length = [...password].length;
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) return false;
    return !this.common.has(password.toLowerCase());
  }

  /** Throws `400 WEAK_PASSWORD` when the password does not meet the policy. */
  validate(password: string): void {
    if (!this.isAcceptable(password)) throw weakPassword();
  }

  isAcceptableForInvitation(password: string): boolean {
    if (!meetsInvitationPasswordRules(password)) return false;
    const { whole, words } = commonForms(password);
    if (whole.some((form) => this.common.has(form) || KEYBOARD_RUNS.some((run) => form.includes(run)))) return false;
    return !words.some((word) => this.localWords.has(word) || (word.length >= MIN_LIST_WORD_LENGTH && this.common.has(word)));
  }

  /** Throws `400 WEAK_PASSWORD` when a password chosen in an invitation or a reset does not meet FR-011a. */
  validateForInvitation(password: string): void {
    if (!this.isAcceptableForInvitation(password)) throw weakPassword();
  }
}
