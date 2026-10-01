# Contract: derived statuses and operation rules

Pure functions in `apps/api/src/modules/activities/status/`, tested exhaustively (every
combination of the inputs below, with the clock before, at and after the deadline). Nothing here
is stored; every read derives it with the server clock (research P4, P11).

## Student status (`deriveStudentStatus`)

Inputs: `submission?`, `gradingComplete`, `released`, `attempt?`, `deadline`, `activityStatus`,
`now`.

| # | Condition (first match) | Status | Label (web) |
|---|---|---|---|
| 1 | submission ∧ released ∧ gradingComplete | `GRADED` | Corrigida |
| 2 | submission | `SUBMITTED` | Entregue |
| 3 | `now > deadline` ∨ activity CLOSED | `OVERDUE` | Atrasada |
| 4 | attempt IN_PROGRESS | `IN_PROGRESS` | Em andamento |
| 5 | — | `PENDING` | Pendente |

`late` = `submission.late` (shown as "Entregue com atraso"; "Entrega aceita pelo professor" when
`acceptedByTeacher`).

`urgent` = not submitted ∧ `deadline − now ≤ 48 h` ∧ not past, or OVERDUE ∧ `canAnswer` (spec
FR-011: other overdue activities show "Atrasada" without the urgency highlight).

**Blank question** (spec FR-023, `blank_count` and the confirmation): no saved answer; multiple
choice with `alternativeId` null; text empty after trim; code empty after trim or identical to the
starter code.

## What the student can do (`canAnswer`, `allowedOperation`)

| Situation | start | save | submit | Code when refused |
|---|---|---|---|---|
| enrollment not ACTIVE | — | — | — | 404 (out of context) |
| class not ACTIVE | ✗ | ✗ | ✗ | `CLASS_NOT_ACTIVE` |
| activity CANCELLED or SCHEDULED | — | — | — | 404 |
| activity CLOSED | ✗ | ✗ | ✗ | `ACTIVITY_CLOSED` |
| submission exists | ✓ (no-op) | ✗ | ✓ (no-op, same submission) | `ATTEMPT_ALREADY_SUBMITTED` |
| `now ≤ deadline` | ✓ | ✓ | ✓ | |
| `now > deadline`, `REJECT` | ✗ | ✗ | ✗ | `DEADLINE_PASSED` |
| `now > deadline`, `ACCEPT_MARKED` | ✓ | ✓ | ✓ (`late = true`) | |
| save/submit without attempt | | ✗ | ✗ | `NOT_STARTED` |

## Action shown (web, from status + `canAnswer`)

| Status | `canAnswer` | Action |
|---|---|---|
| PENDING | ✓ | Iniciar |
| IN_PROGRESS | ✓ | Continuar |
| OVERDUE | ✓ | Entregar com atraso (Iniciar/Continuar) |
| OVERDUE | ✗ | Ver atividade |
| SUBMITTED | — | Ver entrega |
| GRADED | — | Ver resultado |

## Teacher roster status (`deriveRosterStatus`)

| Condition | Status | Label |
|---|---|---|
| submission ∧ ¬late | `SUBMITTED` | Entregou |
| submission ∧ late | `SUBMITTED_LATE` | Entregou com atraso |
| no submission ∧ (`now > deadline` under REJECT ∨ CLOSED) | `MISSED` | Não entregou |
| attempt IN_PROGRESS | `IN_PROGRESS` | Em andamento |
| — | `NOT_STARTED` | Não iniciou |

A MISSED student with an IN_PROGRESS attempt offers the teacher "Aceitar como entrega"
(FR-006b); while the student can still submit, the route answers `409 STUDENT_CAN_STILL_SUBMIT`.

Students in the roster: every ACTIVE enrollment plus anyone with an attempt (a REMOVED student
keeps their attempt visible, marked "Removido da turma").

## Grading at submission (011 rules)

| Question | Strategy | Result at submission |
|---|---|---|
| Multiple choice (work or exercise) | `EXACT_MATCH` | `GRADED`, `RULE_RESULT`, value or 0 (blank = 0) |
| Code with test cases | `TEST_CASES` | `PENDING_TEACHER`, `CODE_RUNNER_UNAVAILABLE` |
| Code without test cases (every exercise) | `TEST_CASES` | `PENDING_TEACHER`, `NO_TEST_CASES` |
| Open answer | `AI_REVIEW` | `PENDING_TEACHER`, `AI_REVIEW_UNAVAILABLE` (new reason, P12) |
| Any, teacher decides | — | `DECIDED`, `HUMAN_DECISION` (overrides a rule result) |

A blank open answer or code is still pending for the teacher (no automatic 0).
