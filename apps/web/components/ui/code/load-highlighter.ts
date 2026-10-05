import type { LanguageSupport } from "@codemirror/language"
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight"
import { createHighlighter } from "./highlighter"

// The read-only highlighter's runtime (014 research L4, L6): imported only through
// `import("./load-highlighter")`, so pages without code never download Lezer.

const highlighter = createHighlighter({ tagHighlighter, tags })

/** A run of the code with its syntax class (null: plain text in `--foreground`). */
export interface CodeSegment {
  text: string
  className: string | null
}

/**
 * Splits `code` into colored runs by the grammar's parser. The runs, joined, are exactly `code`:
 * nothing is normalized (a stored `\r\n` stays), so what the page shows and copies is the text.
 */
export function highlightCode(code: string, grammar: LanguageSupport): CodeSegment[] {
  const tree = grammar.language.parser.parse(code)
  const segments: CodeSegment[] = []
  let position = 0
  highlightTree(tree, highlighter, (from, to, className) => {
    if (from > position) segments.push({ text: code.slice(position, from), className: null })
    segments.push({ text: code.slice(from, to), className })
    position = to
  })
  if (position < code.length) segments.push({ text: code.slice(position), className: null })
  return segments
}
