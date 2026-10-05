import { describe, expect, it } from "vitest"
import { EDITOR_THEME } from "./editor-theme"
import { GRAMMAR_KEYS, grammarLoader } from "./grammars"
import { createHighlighter, SYNTAX_CLASSES } from "./highlighter"

// The pure pieces of the code colors (014 research L3, L5): the grammar registry, the Lezer tag →
// token class mapping and the editor theme. CodeMirror and Lezer are only imported dynamically,
// here as in the app (L6).

describe("014/FR-002 registro de gramáticas", () => {
  it("resolve as 9 chaves para um carregador do LanguageSupport", async () => {
    expect([...GRAMMAR_KEYS].sort()).toEqual(
      ["cpp", "go", "html", "java", "javascript", "php", "python", "rust", "typescript"],
    )
    for (const key of GRAMMAR_KEYS) {
      const load = grammarLoader(key)
      expect(load, key).toBeTypeOf("function")
      const support = await load!()
      expect(support.language.parser, key).toBeDefined()
    }
  })

  it("typescript é o JavaScript com o dialeto TypeScript", async () => {
    const ts = await grammarLoader("typescript")!()
    const js = await grammarLoader("javascript")!()
    expect(ts.language.name).toBe("typescript")
    expect(js.language.name).toBe("javascript")
  })

  it.each([null, undefined, "", "Java", "cobol", "constructor", "__proto__", "toString"])(
    "chave desconhecida ou nula (%s) não tem carregador",
    (key) => {
      expect(grammarLoader(key)).toBeNull()
    },
  )
})

describe("014/FR-004 o destacador mapeia as tags Lezer para as classes de token", () => {
  async function classOf() {
    const lezer = await import("@lezer/highlight")
    const highlighter = createHighlighter(lezer)
    const { tags: t } = lezer
    return { t, of: (tag: unknown) => highlighter.style([tag as Parameters<typeof highlighter.style>[0][number]]) }
  }

  it("as 8 categorias e só as classes text-syntax-*", async () => {
    const { t, of } = await classOf()
    const expected: [string, unknown[]][] = [
      ["keyword", [t.keyword, t.controlKeyword, t.modifier, t.definitionKeyword, t.operatorKeyword, t.tagName]],
      ["string", [t.string, t.special(t.string), t.regexp, t.character]],
      ["number", [t.number, t.bool, t.null, t.atom]],
      ["comment", [t.comment, t.lineComment, t.blockComment, t.docComment]],
      ["type", [t.typeName, t.className, t.namespace, t.attributeName]],
      ["function", [t.function(t.variableName), t.function(t.propertyName), t.macroName]],
      ["operator", [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator]],
      ["punctuation", [t.punctuation, t.bracket, t.separator, t.angleBracket]],
    ]
    expect(expected.map(([category]) => category)).toEqual(Object.keys(SYNTAX_CLASSES))
    for (const [category, list] of expected) {
      for (const tag of list) {
        expect(of(tag), category).toBe(`text-syntax-${category}`)
      }
    }
  })

  it("nome comum de variável e de propriedade ficam sem cor (texto em --foreground)", async () => {
    const { t, of } = await classOf()
    expect(of(t.variableName)).toBeNull()
    expect(of(t.propertyName)).toBeNull()
  })

  it("código Java real: palavra-chave, texto e comentário com as suas classes", async () => {
    const lezer = await import("@lezer/highlight")
    const support = await grammarLoader("java")!()
    const code = 'String nome = "Ana"; // aluno'
    const spans: [string, string][] = []
    lezer.highlightTree(support.language.parser.parse(code), createHighlighter(lezer), (from, to, classes) => {
      spans.push([code.slice(from, to), classes])
    })
    expect(spans).toEqual(
      expect.arrayContaining([
        ["String", "text-syntax-type"],
        ['"Ana"', "text-syntax-string"],
        ["// aluno", "text-syntax-comment"],
      ]),
    )
  })
})

describe("014/FR-016 o tema do editor só usa tokens", () => {
  /** Every [selector › property, value] of the theme spec, nested selectors included. */
  function entries(spec: object, path = ""): [string, string][] {
    return Object.entries(spec).flatMap(([key, value]): [string, string][] =>
      typeof value === "object" && value !== null ? entries(value, `${path}${key} › `) : [[`${path}${key}`, String(value)]],
    )
  }
  const COLOR_PROPERTY = /color|background|border|outline|caret|fill|stroke|shadow/i

  it("toda cor é var(--…), sem valor literal", () => {
    const colors = entries(EDITOR_THEME).filter(([key]) => COLOR_PROPERTY.test(key.split(" › ").at(-1)!))
    expect(colors.length).toBeGreaterThan(5)
    for (const [key, value] of colors) {
      expect(value, key).toMatch(/var\(--[a-z0-9-]+\)/)
      expect(value, key).not.toMatch(/#|rgb|hsl|oklch|\b(black|white|red|blue|gray|grey|transparent|currentcolor)\b/i)
    }
  })

  it("cobre conteúdo, cursor, seleção, números de linha e foco", () => {
    const keys = entries(EDITOR_THEME).map(([key]) => key).join("\n")
    for (const part of [".cm-content", ".cm-cursor", ".cm-selectionBackground", "::selection", ".cm-gutters", "&.cm-focused"]) {
      expect(keys, part).toContain(part)
    }
  })
})
