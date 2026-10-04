import type { Highlighter, Tag, tagHighlighter, tags } from "@lezer/highlight"

/**
 * The code colors (014 research L5): each Lezer tag category gets the Tailwind class of its syntax
 * token, so no color comes from the library. Used by the editor and by `CodeBlock`. Tags not
 * listed (plain names) stay in `--foreground`.
 */
export const SYNTAX_CLASSES = {
  keyword: "text-syntax-keyword",
  string: "text-syntax-string",
  number: "text-syntax-number",
  comment: "text-syntax-comment",
  type: "text-syntax-type",
  function: "text-syntax-function",
  operator: "text-syntax-operator",
  punctuation: "text-syntax-punctuation",
} as const

export type SyntaxCategory = keyof typeof SYNTAX_CLASSES

/** The Lezer tags of each category (contracts/design-tokens.md). */
export function syntaxRules(t: typeof tags): { tag: Tag | readonly Tag[]; class: string }[] {
  const rules: Record<SyntaxCategory, Tag[]> = {
    keyword: [t.keyword, t.controlKeyword, t.modifier, t.definitionKeyword, t.operatorKeyword, t.tagName],
    string: [t.string, t.special(t.string), t.regexp, t.character],
    number: [t.number, t.bool, t.null, t.atom],
    comment: [t.comment, t.lineComment, t.blockComment, t.docComment],
    type: [t.typeName, t.className, t.namespace, t.attributeName],
    function: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    operator: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator],
    punctuation: [t.punctuation, t.bracket, t.separator, t.angleBracket],
  }
  return (Object.keys(rules) as SyntaxCategory[]).map((category) => ({ tag: rules[category], class: SYNTAX_CLASSES[category] }))
}

/**
 * The highlighter, built from the `@lezer/highlight` module the caller already loaded (only the
 * `load-*.ts` loaders import it, research L6).
 */
export function createHighlighter(lezer: { tagHighlighter: typeof tagHighlighter; tags: typeof tags }): Highlighter {
  return lezer.tagHighlighter(syntaxRules(lezer.tags))
}
