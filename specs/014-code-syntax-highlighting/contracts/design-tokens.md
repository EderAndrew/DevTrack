# Contract: syntax tokens

Added to `apps/web/design-system/tokens.css` (light in `:root`, dark in the
`prefers-color-scheme: dark` block and in `:root[data-theme="dark"]`), documented in `tokens.md`, and
added to the pairs of `test/contrast.test.ts` (each over `--background`, minimum 4.5:1). Tailwind
exposes them as `text-syntax-*` utilities. Plain code text uses `--foreground`; line numbers keep
`--text-secondary` (005).

| Token | Light | Contrast on `#f8fafc` | Dark | Contrast on `#0b1120` | Lezer tags (research L5) |
|-------|-------|----------------------|------|-----------------------|--------------------------|
| `--syntax-keyword` | `#a626a4` | 5.84 | `#d8a8f0` | 9.67 | keyword, controlKeyword, modifier, definitionKeyword, operatorKeyword, tagName |
| `--syntax-string` | `#2f7a2f` | 5.09 | `#8fd18f` | 10.48 | string, special(string), regexp, character |
| `--syntax-number` | `#a1511a` | 5.41 | `#f0b27a` | 10.18 | number, bool, null, atom |
| `--syntax-comment` | `#5f6b7a` | 5.19 | `#94a3b8` | 7.34 | comment, lineComment, blockComment, docComment |
| `--syntax-type` | `#0e6f8a` | 5.48 | `#7fd4e8` | 11.19 | typeName, className, namespace, attributeName |
| `--syntax-function` | `#3451b2` | 6.77 | `#a5b8ff` | 9.77 | function(variableName), function(propertyName), macroName |
| `--syntax-operator` | `#b42318` | 6.28 | `#ff9b94` | 9.30 | operator, compareOperator, logicOperator, arithmeticOperator |
| `--syntax-punctuation` | `#475569` | 7.24 | `#cbd5e1` | 12.68 | punctuation, bracket, separator, angleBracket |

Rules:
- No other color in the editor or `CodeBlock`: the CodeMirror theme sets content, cursor, selection,
  gutters, active line and focus colors with `var(--…)` tokens only (a unit test checks every color
  value of the theme object).
- `@media (forced-colors: active)`: every `text-syntax-*` class uses `CanvasText` (system colors).
- Meaning never depends on color: the code without colors is the same code (spec FR-018).
- Values may be tuned during implementation only within the contrast test; the table is updated with
  them.
