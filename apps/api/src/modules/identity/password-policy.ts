import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * Password strength rule (FR-011): 12–128 characters, no composition rules, and not in the
 * common-passwords list (compared case-insensitively). The list is loaded once at startup,
 * so a missing file stops the API from booting instead of silently accepting weak passwords.
 * Provided through a factory in IdentityModule.
 */
export class PasswordPolicy {
  private readonly common: ReadonlySet<string>;

  constructor(common?: ReadonlySet<string>) {
    this.common = common ?? loadCommonPasswords();
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
}
