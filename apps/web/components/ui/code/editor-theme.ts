/**
 * The editor's theme (014 research L5, FR-016): every color CodeMirror's base theme sets —
 * content, cursor, selection, line numbers, focus — comes from a design-system token, so both
 * themes and high contrast follow the tokens. A plain spec object, given to `EditorView.theme` by
 * `load-editor.ts`. The selection keeps each token's syntax color over `--primary-subtle`
 * (pairs checked by test/contrast.test.ts); there is no active-line highlight. Font and size come
 * from the editor's wrapper (`font-mono text-code`).
 */
export const EDITOR_THEME = {
  "&": {
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
  },
  "&.cm-focused": {
    outline: "var(--focus-ring-width) solid var(--ring)",
    outlineOffset: "var(--focus-ring-offset)",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--primary-subtle)",
  },
  ".cm-content ::selection": {
    backgroundColor: "var(--primary-subtle)",
  },
  // The example of an empty field, as the fields' `placeholder:text-text-secondary`.
  ".cm-placeholder": {
    color: "var(--text-secondary)",
  },
  ".cm-gutters": {
    color: "var(--text-secondary)",
    backgroundColor: "var(--background)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--background)",
  },
  "&.cm-disabled, &.cm-disabled .cm-gutters": {
    backgroundColor: "var(--disabled-bg)",
  },
} as const
