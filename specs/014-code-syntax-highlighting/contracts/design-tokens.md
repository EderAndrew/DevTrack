# Contract: syntax tokens

Added to `apps/web/design-system/tokens.css` (`:root`; one dark theme, the Vice City palette, since the
005 FR-013 amendment of 2026-10-22), documented in `tokens.md`, and added to the pairs of
`test/contrast.test.ts` (each over `--background`, `--surface`, `--primary-subtle` and `--disabled-bg`,
minimum 4.5:1). Tailwind exposes them as `text-syntax-*` utilities. Plain code text uses `--foreground`;
line numbers keep `--text-secondary` (005).

| Token | Value | Contrast on `#0b0f2b` | Lezer tags (research L5) |
|-------|-------|-----------------------|--------------------------|
| `--syntax-keyword` | `#d29bff` | 8.84 | keyword, controlKeyword, modifier, definitionKeyword, operatorKeyword, tagName |
| `--syntax-string` | `#7cf0b0` | 13.38 | string, special(string), regexp, character |
| `--syntax-number` | `#ffb86b` | 11.03 | number, bool, null, atom |
| `--syntax-comment` | `#9e9ac8` | 7.08 | comment, lineComment, blockComment, docComment |
| `--syntax-type` | `#00f0ff` | 13.34 | typeName, className, namespace, attributeName |
| `--syntax-function` | `#ff8fc4` | 8.93 | function(variableName), function(propertyName), macroName |
| `--syntax-operator` | `#ff8a80` | 8.23 | operator, compareOperator, logicOperator, arithmeticOperator |
| `--syntax-punctuation` | `#c8c4ea` | 11.22 | punctuation, bracket, separator, angleBracket |

Rules:
- No other color in the editor or `CodeBlock`: the CodeMirror theme sets content, cursor, selection,
  gutters, active line and focus colors with `var(--…)` tokens only (a unit test checks every color
  value of the theme object).
- `@media (forced-colors: active)`: every `text-syntax-*` class uses `CanvasText` (system colors).
- Meaning never depends on color: the code without colors is the same code (spec FR-018).
- Values may be tuned during implementation only within the contrast test; the table is updated with
  them.
