# HTTP API Contract: 014 — Realce de Sintaxe do Código

No new route, permission, error or audit event. Every language object a response carries gains
`highlight`; the 010–013 conventions apply unchanged.

```ts
// packages/contracts/src/common/code-highlight.ts (shared: exercises and works may not import each other)
CodeHighlight = string /* ^[a-z][a-z0-9-]{0,31}$ */ | null    // grammar key (research L3); null = no highlighting

ProgrammingLanguageView = { id, key, name, highlight: CodeHighlight }   // GET /programming-languages, GET /works/programming-languages
```

| Shape (file) | Today | After |
|--------------|-------|-------|
| `ProgrammingLanguageView` (`exercises/programming-languages.ts`) | `{ id, key, name }` | `+ highlight` |
| Exercise teacher view `language` (`exercises/exercises.ts`) | `{ id, name } \| null` | `{ id, name, highlight } \| null` |
| Exercise student view `language` (`exercises/exercises.ts`) | `{ name }` (optional) | `{ name, highlight }` (optional) |
| Work question teacher view `language` (`works/works.ts`) | `{ id, name }` (optional) | `{ id, name, highlight }` (optional) |
| Work question student view `language` (`works/works.ts`) | `{ name }` (optional) | `{ name, highlight }` (optional) |
| Activity question teacher view `language` (`activities/teacher.ts`) | `{ id, name } \| null` | `{ id, name, highlight } \| null` |
| Activity question student view `language` (`activities/student.ts`) | `{ name } \| null` | `{ name, highlight } \| null` |

Rules:
- The value comes from `programming_languages.highlight` at view time; the snapshot keeps only
  `language_id`.
- Student views copy `highlight` explicitly in their allowlists (`student-view.ts` of exercises,
  works and activities); it is presentation data and never carries an answer key.
- Requests don't change: forms keep sending `languageId`; `highlight` is never accepted from a
  client (strict bodies already refuse unknown fields).
- The endpoint catalog (`endpoints.ts`) needs no new entry; the conformance interceptor checks the
  new field on every response.
