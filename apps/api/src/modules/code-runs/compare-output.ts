// The output comparison of a test case (019 research B7, FR-012). Pure and without imports, so the
// grading of a later stage reuses it as is.

/**
 * Line breaks become `\n`, spaces and tabs at the end of each line go, and empty lines at the end go.
 * Nothing else changes: case, accents, inner spaces, blank lines in the middle and Unicode forms count.
 */
export function normalizeOutput(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** A case's output passes iff it equals the expected output after `normalizeOutput`. */
export function outputsMatch(stdout: string, expected: string): boolean {
  return normalizeOutput(stdout) === normalizeOutput(expected);
}
