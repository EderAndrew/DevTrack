import { history, historyKeymap, insertNewline, redo, standardKeymap } from "@codemirror/commands"
import { type LanguageSupport, syntaxHighlighting } from "@codemirror/language"
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view"
import * as lezer from "@lezer/highlight"
import { EDITOR_THEME } from "./editor-theme"
import { createHighlighter } from "./highlighter"

// The code editor's runtime (014 research L2, L6): the only module that imports CodeMirror, and
// only through `import("./load-editor")`, so pages without code never download it.

/** The 012 indentation step: Tab inserts two spaces. */
const INDENT = "  "

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"])

/** Marks a change that came from the props (a value set from outside), not from typing. */
const fromProps = Annotation.define<boolean>()

const highlighter = createHighlighter(lezer)

export interface CodeEditorSetup {
  parent: HTMLElement
  value: string
  /** Carried over from the textarea when the editor takes its place. */
  selection?: { anchor: number; head: number }
  grammar: LanguageSupport | null
  editable: boolean
  readOnly: boolean
  /** ARIA and other attributes of the editable content (research L7). */
  attributes: Record<string, string>
  /**
   * A CONTROLLED attempt (015 research F6): paste, drop, copy and cut do nothing in the editor (the
   * page's own listener records each gesture). Fixed for the editor's life.
   */
  blockClipboard?: boolean
  /** Example text shown while the editor is empty; never part of the value. */
  placeholder?: string
  /** The whole text after each change typed, pasted, cut, undone or redone; never for `setValue`. */
  onChange: (value: string) => void
}

export interface CodeEditorInstance {
  readonly view: EditorView
  /** Replaces the text when the value changes from outside; does not call `onChange`. */
  setValue(value: string): void
  setGrammar(grammar: LanguageSupport | null): void
  setEditable(editable: boolean, readOnly: boolean): void
  setAttributes(attributes: Record<string, string>): void
  setPlaceholder(text: string | undefined): void
  focus(): void
  destroy(): void
}

/** CodeMirror splits on `\r\n`, `\r` and `\n` and joins with `\n`, as the textarea's value does. */
export const normalizeLineBreaks = (text: string) => text.replace(/\r\n?/g, "\n")

/**
 * Exactly the extensions of L2: nothing typed is changed — no closing brackets, completion, lint,
 * search or automatic indentation (Enter is a plain new line). Esc then Tab leaves the editor
 * (CodeMirror's tab-focus mode); Shift+Tab is not bound, so it moves the focus back.
 */
function editingExtensions(): Extension[] {
  // Esc then Tab leaves, with no time limit, as in the 012 textarea (CodeMirror's own tab-focus
  // mode lasts 2 s); any other key in between cancels it.
  let escaped = false
  const tab = (view: EditorView) => {
    if (view.state.readOnly || escaped) {
      escaped = false
      return false
    }
    view.dispatch(view.state.replaceSelection(INDENT), { scrollIntoView: true, userEvent: "input" })
    return true
  }
  return [
    lineNumbers(),
    history(),
    EditorView.domEventHandlers({
      keydown(event) {
        if (event.key === "Escape") escaped = true
        else if (event.key !== "Tab" && !MODIFIERS.has(event.key)) escaped = false
        return false
      },
      blur() {
        escaped = false
        return false
      },
    }),
    keymap.of([
      { key: "Tab", run: tab },
      { key: "Enter", run: insertNewline },
      // Ctrl/Cmd+Shift+Z redoes on every platform (CodeMirror binds it only on Linux and macOS).
      { key: "Mod-Shift-z", run: redo, preventDefault: true },
      ...historyKeymap,
      ...standardKeymap.filter((binding) => binding.key !== "Enter"),
    ]),
    syntaxHighlighting(highlighter),
    EditorView.theme(EDITOR_THEME),
  ]
}

/** Every clipboard gesture refused before CodeMirror's own handlers (015/FR-013a, FR-013b). */
const refuse = (event: Event) => {
  event.preventDefault();
  return true;
};
const clipboardBlock = (): Extension => EditorView.domEventHandlers({ paste: refuse, drop: refuse, copy: refuse, cut: refuse });

const editableExtensions = (editable: boolean, readOnly: boolean): Extension[] => [
  EditorView.editable.of(editable),
  EditorState.readOnly.of(readOnly || !editable),
  EditorView.editorAttributes.of(editable ? {} : { class: "cm-disabled" }),
]

const placeholderExtension = (text: string | undefined): Extension => (text ? placeholder(text) : [])

export function createCodeEditor(setup: CodeEditorSetup): CodeEditorInstance {
  const grammar = new Compartment()
  const editable = new Compartment()
  const attributes = new Compartment()
  const example = new Compartment()
  const value = normalizeLineBreaks(setup.value)
  const selection = setup.selection
    ? { anchor: Math.min(setup.selection.anchor, value.length), head: Math.min(setup.selection.head, value.length) }
    : undefined

  const view = new EditorView({
    parent: setup.parent,
    state: EditorState.create({
      doc: value,
      selection,
      extensions: [
        ...editingExtensions(),
        setup.blockClipboard ? clipboardBlock() : [],
        grammar.of(setup.grammar ?? []),
        editable.of(editableExtensions(setup.editable, setup.readOnly)),
        attributes.of(EditorView.contentAttributes.of(setup.attributes)),
        example.of(placeholderExtension(setup.placeholder)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          if (update.transactions.some((transaction) => transaction.annotation(fromProps))) return
          setup.onChange(update.state.doc.toString())
        }),
      ],
    }),
  })

  return {
    view,
    setValue(next) {
      const text = normalizeLineBreaks(next)
      if (text === view.state.doc.toString()) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: fromProps.of(true) })
    },
    setGrammar(next) {
      view.dispatch({ effects: grammar.reconfigure(next ?? []) })
    },
    setEditable(nextEditable, nextReadOnly) {
      view.dispatch({ effects: editable.reconfigure(editableExtensions(nextEditable, nextReadOnly)) })
    },
    setAttributes(next) {
      view.dispatch({ effects: attributes.reconfigure(EditorView.contentAttributes.of(next)) })
    },
    setPlaceholder(next) {
      view.dispatch({ effects: example.reconfigure(placeholderExtension(next)) })
    },
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
    },
  }
}
