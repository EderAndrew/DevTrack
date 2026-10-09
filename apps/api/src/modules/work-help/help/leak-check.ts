import type { WorkHelpBlockReason } from "@repo/contracts";

// The deterministic leak check of an orientation (015 research F10, FR-018): run in `materialize`,
// which reads the answer key from the snapshot; the key never reaches the model. Thresholds are named
// so the unit tests pin each boundary.

/** A multiple-choice alternative's text counts as quoted from this many normalized characters. */
export const MIN_ALTERNATIVE_CHARS = 12;
/** A shorter alternative is protected by its words of at least this many letters (F10, amended 2026-10-08). */
export const MIN_ALTERNATIVE_WORD_CHARS = 3;
/**
 * Common Portuguese words that never protect a short alternative: an alternative "Sim" or "Não"
 * would otherwise block nearly every orientation.
 */
export const COMMON_WORDS: ReadonlySet<string> = new Set([
  "nao", "sim", "que", "uma", "uns", "umas", "dos", "das", "nos", "nas", "com", "sem", "por", "para", "pelo", "pela",
  "como", "mais", "menos", "mas", "nem", "seu", "sua", "isso", "este", "esta", "esse", "essa", "todos", "todas",
  "nenhum", "nenhuma", "ambos", "ambas", "outro", "outra", "acima", "anteriores",
]);
/** An open answer's whole expected answer counts as quoted from this many normalized characters. */
export const MIN_WHOLE_ANSWER_CHARS = 25;
/** Shared runs of this many normalized words with the expected answer or the explanation. */
export const SHINGLE_TOKENS = 8;
/** Shared runs of this many consecutive non-trivial lines with the expected solution. */
export const SOLUTION_RUN_LINES = 3;
/** A solution line is non-trivial from this many characters once its whitespace is removed. */
export const MIN_SOLUTION_LINE_CHARS = 8;

/** The answer key of one snapshot question, and what the student already sees of it (never blocked). */
export type LeakCheckKey =
  | { type: "MULTIPLE_CHOICE"; alternatives: readonly string[] }
  | { type: "OPEN_ANSWER"; statement: string; expectedAnswer: string | null; explanation: string | null }
  | { type: "CODE"; starterCode: string | null; expectedSolution: string | null };

export interface LeakCheckGuidance {
  message: string;
  example: string | null;
}

/** Lowercase, accents removed, punctuation → space, whitespace collapsed. */
export function normalizeText(text: string): string {
  return withoutAccents(text.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const withoutAccents = (text: string) => text.normalize("NFD").replace(/\p{M}+/gu, "");

/**
 * The reason an orientation may not reach the student, or null when it may. Every alternative is
 * protected, so the orientation can neither name the right one nor eliminate or rank the others.
 */
export function checkLeak(key: LeakCheckKey, guidance: LeakCheckGuidance): WorkHelpBlockReason | null {
  const text = guidance.example === null ? guidance.message : `${guidance.message}\n${guidance.example}`;
  switch (key.type) {
    case "MULTIPLE_CHOICE":
      return referencesAlternative(text, key.alternatives) ? "MC_ALTERNATIVE_REFERENCED" : null;
    case "OPEN_ANSWER":
      return overlapsExpectedAnswer(text, key) ? "EXPECTED_ANSWER_OVERLAP" : null;
    case "CODE":
      return overlapsSolution(text, key) ? "SOLUTION_OVERLAP" : null;
  }
}

/**
 * A label in any of its forms — "alternativa B", "letra c", "opção (D)", "item E", "(A)", a line that
 * starts with "B)" or "(b)" — or the text of any alternative of at least `MIN_ALTERNATIVE_CHARS`; a
 * shorter one by `shortAlternativeQuoted`.
 * Lowercase "a" and "e" after a word are the Portuguese article and conjunction ("cada item a
 * seguir"), so only their uppercase or parenthesized forms count there.
 */
const NAMED_LABEL = /\b(?:alternativas?|letras?|opc(?:ao|oes)|itens|item)\s*(\(\s*)?([a-z])(\s*\))?(?![\p{L}\p{N}])/giu;
const PAREN_LABEL = /\(\s*[A-E]\s*\)/;
const LINE_LABEL = /^\s*\(?\s*[a-e]\s*\)/im;

function namesLabel(plain: string): boolean {
  for (const [, open, letter, close] of plain.matchAll(NAMED_LABEL)) {
    if (/^[A-E]$/.test(letter!) || /^[b-d]$/.test(letter!)) return true;
    if (/^[a-e]$/.test(letter!) && (open !== undefined || close !== undefined)) return true;
  }
  return false;
}

function referencesAlternative(text: string, alternatives: readonly string[]): boolean {
  const plain = withoutAccents(text);
  if (namesLabel(plain) || PAREN_LABEL.test(plain) || LINE_LABEL.test(plain)) return true;
  const padded = ` ${normalizeText(text)} `;
  return alternatives.some((alternative) => {
    const normalized = normalizeText(alternative);
    if (normalized.length >= MIN_ALTERNATIVE_CHARS) return padded.includes(` ${normalized} `);
    return shortAlternativeQuoted(text, padded, alternative, normalized);
  });
}

/**
 * A short alternative ("Pilha", "O(log n)", "O(1)"): every distinctive word of it (at least
 * `MIN_ALTERNATIVE_WORD_CHARS` letters, not in `COMMON_WORDS`) appears as a whole word, so an analogy
 * like "pilha de pratos" names it; with no such word but with symbols ("O(1)", "2^n"), its own text
 * between non-alphanumeric boundaries. One with neither ("2", "O1") can't be checked.
 */
function shortAlternativeQuoted(text: string, padded: string, alternative: string, normalized: string): boolean {
  const words = normalized.split(" ").filter((word) => word.length >= MIN_ALTERNATIVE_WORD_CHARS && /[a-z]/.test(word) && !COMMON_WORDS.has(word));
  if (words.length > 0) return words.every((word) => padded.includes(` ${word} `));
  const symbolic = collapsed(alternative);
  if (!/[^a-z0-9 ]/.test(symbolic) || !/[a-z0-9]/.test(symbolic)) return false;
  const escaped = symbolic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(collapsed(text));
}

/** Lowercase, accents removed, whitespace collapsed; punctuation kept. */
const collapsed = (text: string) => withoutAccents(text.toLowerCase()).replace(/\s+/g, " ").trim();

/**
 * The whole expected answer (from `MIN_WHOLE_ANSWER_CHARS`), or any run of `SHINGLE_TOKENS` words
 * shared with the expected answer or the explanation — except runs the statement itself has, which
 * the student already reads.
 */
function overlapsExpectedAnswer(text: string, key: Extract<LeakCheckKey, { type: "OPEN_ANSWER" }>): boolean {
  const normalized = normalizeText(text);
  const expected = normalizeText(key.expectedAnswer ?? "");
  if (expected.length >= MIN_WHOLE_ANSWER_CHARS && ` ${normalized} `.includes(` ${expected} `)) return true;
  const visible = shingles(normalizeText(key.statement));
  const secret = new Set([...shingles(expected), ...shingles(normalizeText(key.explanation ?? ""))].filter((shingle) => !visible.has(shingle)));
  if (secret.size === 0) return false;
  return [...shingles(normalized)].some((shingle) => secret.has(shingle));
}

function shingles(normalized: string): Set<string> {
  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  const result = new Set<string>();
  for (let start = 0; start + SHINGLE_TOKENS <= tokens.length; start++) result.add(tokens.slice(start, start + SHINGLE_TOKENS).join(" "));
  return result;
}

/**
 * `SOLUTION_RUN_LINES` consecutive non-trivial lines of the expected solution, or, for a solution of
 * at most that many such lines, the whole of it. Lines the starter code already shows don't count.
 * Code lines are compared without whitespace and case, keeping their punctuation.
 */
function overlapsSolution(text: string, key: Extract<LeakCheckKey, { type: "CODE" }>): boolean {
  const starter = new Set(codeLines(key.starterCode ?? ""));
  const solution = codeLines(key.expectedSolution ?? "").filter((line) => !starter.has(line));
  if (solution.length === 0) return false;
  if (solution.length <= SOLUTION_RUN_LINES) return compactCode(text).includes(solution.join(""));
  const guidance = codeLines(text);
  const runs = new Set<string>();
  for (let start = 0; start + SOLUTION_RUN_LINES <= solution.length; start++) runs.add(solution.slice(start, start + SOLUTION_RUN_LINES).join("\n"));
  for (let start = 0; start + SOLUTION_RUN_LINES <= guidance.length; start++) {
    if (runs.has(guidance.slice(start, start + SOLUTION_RUN_LINES).join("\n"))) return true;
  }
  return false;
}

const compactCode = (text: string) => withoutAccents(text.toLowerCase()).replace(/\s+/g, "");

/** The non-trivial lines of a text, each without whitespace, in order. */
function codeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(compactCode)
    .filter((line) => line.length >= MIN_SOLUTION_LINE_CHARS);
}
