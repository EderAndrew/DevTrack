# Permissions: 018

| Permission | Granted to | Used by |
|---|---|---|
| `provas.visualizar` (new) | TEACHER | list, read and preview own exams |
| `provas.criar` (new) | TEACHER | create an exam manually |
| `provas.editar` (new) | TEACHER | edit an exam |
| `provas.aprovar` (new) | TEACHER | approve an exam (DRAFT → APPROVED) |
| `provas.arquivar` (new) | TEACHER | archive and restore an exam |
| `ia.provas.gerar` (new) | TEACHER | "Criar prova com IA" (`exam-generator`) |
| `provas.encerramentos.decidir` (new) | TEACHER | confirm cancellation, return, do not cancel |
| `atividades.aplicar` (012) | TEACHER | apply an exam to a class (and `scope-check` with coverage) |
| `chamada.registrar` (016) | TEACHER | attendance, pause/release, exam monitor |
| `entregas.visualizar`, `notas.lancar`, `notas.liberar` (012) | TEACHER | review, grading, release |
| `atividades.proprias.responder` (012) | STUDENT | start (accept rules), save, submit, events |
| `atividades.proprias.visualizar` (012) | STUDENT | exam view, own occurrences and pauses afterwards |
| `ia.agentes.gerenciar` (006) | ADMIN | enable `exam-generator` |

ADMIN and MANAGER get none of the exam permissions, so they receive `403`. Every route has a row
in `authorization-matrix.ts`. Outside the user's context → `404`: another teacher's exam, another
class's activity, a student who is not present, another student's attempt or hold.
