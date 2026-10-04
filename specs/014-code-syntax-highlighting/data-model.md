# Data Model: 014 — Realce de Sintaxe do Código

One column; nothing else in the database changes.

## `programming_languages` (010) — changed

| Column | Type | Rule |
|--------|------|------|
| `highlight` (new) | `text NULL` | CHECK `highlight ~ '^[a-z][a-z0-9-]{0,31}$'`; the grammar key the web uses to color this language's code (research L3); NULL = no highlighting |

Seed (migration, idempotent `UPDATE … WHERE key = …`):

| `key` | `highlight` |
|-------|-------------|
| `angular` | `typescript` |
| `c` | `cpp` |
| `cpp` | `cpp` |
| `go` | `go` |
| `html-css` | `html` |
| `java` | `java` |
| `javascript` | `javascript` |
| `nest` | `typescript` |
| `node` | `javascript` |
| `php` | `php` |
| `python` | `python` |
| `rust` | `rust` |
| `typescript` | `typescript` |

Prisma: `highlight String?` on `ProgrammingLanguage`. The catalog stays read-only data seeded by
migrations (010 research X17).

## Unchanged

- Exercises, works, activity snapshots and answers keep `language_id` and the code as text; nothing
  is migrated (the grammar is read from the catalog when a view is built, research L8).
- No new table, enum, permission, audit type or route.

## Design-system data (web)

- **Syntax tokens** (`apps/web/design-system/tokens.css`): `--syntax-keyword`, `--syntax-string`,
  `--syntax-number`, `--syntax-comment`, `--syntax-type`, `--syntax-function`, `--syntax-operator`,
  `--syntax-punctuation`, each with a light and a dark value (contracts/design-tokens.md); plain
  text uses `--foreground`.
- **Grammar registry** (`apps/web/components/ui/code/grammars.ts`): grammar key → lazy loader. Keys:
  `java`, `python`, `javascript`, `typescript`, `cpp`, `php`, `rust`, `go`, `html`.
