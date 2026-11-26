# Data Model: Calendário com tipos de data (031)

One migration, `…_031_calendar_day_kinds` (CK1, CK2, CK13).

## Enums

- `class_meeting_kind`: `CLASS`, `EXAM`, `ASSIGNMENT`, `REVIEW`, `MAKEUP` — the kinds that are encontros.
- `class_calendar_day_kind`: `HOLIDAY`, `RECESS`, `SPECIAL_EVENT`, `TEACHER_ABSENCE` — the kinds that are not.

The contract joins them in one `CalendarDayKind` (nine values) for the web and the student view.

## `class_meetings` (changed)

| Column | Type | Rule |
|--------|------|------|
| `kind` | `class_meeting_kind` NOT NULL DEFAULT `'CLASS'` | every existing row becomes `CLASS` (FR-011, SC-007) |
| `description` | text NULL | `CHECK ((kind = 'CLASS') = (description IS NULL))`; `CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 120)` |

Unchanged: `UNIQUE (class_id, meeting_date)`, numbering by date (E12), `status` (still only `PLANNED`), topics FK.

## `class_calendar_days` (new)

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `class_id` | uuid NOT NULL → `classes(id)` RESTRICT | the disciplina da turma (FR-013) |
| `day_date` | date NOT NULL | `UNIQUE (class_id, day_date)` |
| `kind` | `class_calendar_day_kind` NOT NULL | |
| `description` | text NULL | required (1–120) for `HOLIDAY`, `RECESS`, `SPECIAL_EVENT`; NULL for `TEACHER_ABSENCE` |
| `absence_reason` | text NULL | required (1–500) iff `TEACHER_ABSENCE`; teacher only |
| `absence_notice` | text NULL | only on `TEACHER_ABSENCE`, NULL or 1–200 |
| `created_at`, `updated_at` | timestamptz | |

CHECKs: one per kind group (as above); lengths in `char_length` (code points), no `\u0000` (`position(chr(0) …) = 0` is
implied: Postgres text refuses NUL).

Index: `(class_id, day_date)` via the UNIQUE.

## Cross-table guard (CK2)

- Trigger `class_meetings_date_free` (BEFORE INSERT OR UPDATE OF `meeting_date`, `class_id`) raises when
  `class_calendar_days` has the same `(class_id, date)`; trigger `class_calendar_days_date_free` symmetric.
- The service runs under `lockOwnedClass` and deletes before it inserts within one save, so a date moving from one table to
  the other never trips the trigger.

## Permissions

| Key | Description | Roles |
|-----|-------------|-------|
| `calendario.turma.visualizar` | Ver o calendário das disciplinas das próprias turmas | `STUDENT` |

## Derived on read (never stored)

- Meeting number (E12) — only over `class_meetings`.
- "Total de aulas selecionadas" = count of `class_meetings`.
- Student's text: `description`, or `absence_notice` for `TEACHER_ABSENCE`, or none for `CLASS`.
- `today` = `planningToday(clock.now())`.

## Transitions of a date (one save, CK3)

```text
unmarked ──set meeting kind / add──▶ meeting(kind)
unmarked ──set day kind──────────▶ day(kind)
meeting(k1) ──set meeting kind k2──▶ meeting(k2)            topics kept
meeting ──set day kind / remove──▶ day / unmarked            topics need FR-029 resolutions (else 409)
day ──set meeting kind / add─────▶ meeting(kind)              (add on a day: 400 — use set)
day(k1) ──set day kind k2─────────▶ day(k2)
day ──remove─────────────────────▶ unmarked
```

`add` of a date that is already a day is `400` (ambiguous); `add` of a meeting date keeps today's "no effect".
