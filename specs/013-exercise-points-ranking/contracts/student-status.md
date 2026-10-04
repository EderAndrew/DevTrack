# Contract: derived statuses, operations, results and ranking (EXERCISE)

Pure functions, tested exhaustively; ASSIGNMENT rows of the 012 contract are unchanged.

## Student status (`deriveStudentStatus`, EXERCISE branch)

| # | Condition (first match) | Status | Label |
|---|---|---|---|
| 1 | a concluded attempt exists | `COMPLETED` | Concluída |
| 2 | an open attempt | `IN_PROGRESS` | Em andamento |
| 3 | — | `PENDING` | Pendente |

`awaitingCorrection` = attempt 1 has a `PENDING_TEACHER` result ("Pontos aguardando correção").
Never `OVERDUE`, `SUBMITTED`, `GRADED`, `late` or `urgent`. Filter `COMPLETED` (012) includes it.

## Operations (`allowedOperation`, EXERCISE)

| Situation | start | retry | save | complete | Code when refused |
|---|---|---|---|---|---|
| enrollment not ACTIVE; activity CANCELLED or SCHEDULED | — | — | — | — | 404 |
| class not ACTIVE | ✗ | ✗ | ✗ | ✗ | `CLASS_NOT_ACTIVE` |
| activity CLOSED | ✗ | ✗ | ✗ | ✗ | `ACTIVITY_CLOSED` |
| no attempt | ✓ | ✗ | ✗ | ✗ | `NOT_STARTED` |
| open attempt `n` | ✓ (no-op, returns `n`) | ✗ | ✓ | ✓ (`n`) | `ATTEMPT_NOT_COMPLETED` |
| latest attempt `n` concluded | ✓ (no-op) | ✓ (`afterNumber = n`) | ✗ | ✓ (no-op on `n`) | `NOT_LATEST_ATTEMPT` for `afterNumber ≠ n` |

Action shown: PENDING → "Iniciar"; IN_PROGRESS → "Continuar"; COMPLETED → "Ver resultado" and
"Refazer" (or "Continuar" when a retry is open).

## Results at conclusion

| Question | Answer | Attempt 1, slot free | Attempt 1, slot taken ("já pontuado") or attempt > 1 |
|---|---|---|---|
| Multiple choice | correct | `CORRECT`, points | `CORRECT`, 0 |
| Multiple choice | wrong or blank | `WRONG`, 0 | `WRONG`, 0 |
| Open answer / code | blank | `WRONG`, 0 | `WRONG`, 0 |
| Open answer / code | answered | `PENDING_TEACHER`, 0 | `UNSCORED`, 0 |

Teacher mark (scoring open/code rows only): `CORRECT` → points; `WRONG` → 0; nature
HUMAN_DECISION. Labels: Certo, Errado, Aguardando correção, Compare com o gabarito; "Já pontuado em
outra atividade" when `alreadyScored`.

## Teacher roster (EXERCISE)

| Condition | Status | Label |
|---|---|---|
| attempt 1 concluded | `COMPLETED` | Concluiu (+ "N aguardando correção") |
| open attempt 1 | `IN_PROGRESS` | Em andamento |
| — | `NOT_STARTED` | Não iniciou |

## Ranking (`rankClass`)

Rows of every ACTIVE enrollment; points = Σ scoring results of non-cancelled activities of the
class. Order: points desc, then name (`pt-BR`, accent- and case-insensitive). Position: standard
competition (equal points share the position; the next skips: 1, 2, 2, 4). A class with no
points: everyone in 1st with 0.
