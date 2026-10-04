# Quickstart: 014 — Realce de Sintaxe do Código

Prerequisites: the project's `CLAUDE.md` setup (Docker postgres/postgres-test/mailpit, `.env`).

```bash
pnpm install                                     # the CodeMirror packages
pnpm --filter api prisma migrate deploy          # applies <ts>_code_highlight (programming_languages.highlight)
pnpm build
pnpm --filter api dev & pnpm --filter web dev
```

Manual check (one teacher, one class with a student, a syllabus with Java):

1. Teacher → Banco de exercícios → novo exercício de Código em Java: "Código inicial" and "Solução
   esperada" show colored Java as you type; switch the language to Python — the colors change, the
   text stays. Save as approved.
2. Apply it to the class. Student → the activity: the editor shows the starter code colored, with line
   numbers; type `String nome = "Ana"; // aluno` — keyword, string and comment get their colors.
   Tab indents; Esc then Tab leaves the editor.
3. Reload the page: the answer comes back identical. Go offline, type, come back online: saved.
4. Paste `<script>alert(1)</script>`: it shows as text.
5. Conclude (Exercício): the result shows your answer and the reference solution colored, read-only;
   copy a line — the clipboard holds only the code.
6. Teacher → the attempt: the student's answer and the expected solution colored.
7. Dark theme (system setting) and the OS high-contrast mode: readable; `/design-system` shows the
   syntax tokens and both components.
8. Phone width (360 px): long lines scroll inside the editor, the page doesn't scroll sideways.

Automated:

```bash
pnpm --filter web test                           # components, tokens, contrast, design-system guards
pnpm --filter api test test/integration/014-     # catalog column and the views' highlight
pnpm --filter @repo/contracts test
pnpm --filter web test:e2e                       # code-highlighting.spec.ts (colors, keyboard, 360 px, timings)
```
