# UI contract: Turmas do gestor e disciplinas da turma (027)

Texts only in the web (XXVI); Design System tokens and components; dark and light themes; phone width; names rendered
as text (FR-033).

## MANAGER — "Turmas" (`/gestao/turmas`, `features/cohorts`)

- Menu "Turmas" for `turmas.visualizar`. List: search, filters by year and situation (default ativas + inativas),
  columns name, code, year, period, situation, students, disciplinas; "Nova turma".
- Form (create/edit): name, code, ano letivo, period, description. Messages: "Turma criada.", "Turma atualizada.",
  "Esse código de turma já está em uso." (FR-032).
- Page `/gestao/turmas/[id]`: data + actions "Encerrar" (inativar), "Reativar", "Arquivar" (AlertDialog confirming
  that pending invitations are cancelled); tabs **Alunos** (name, e-mail, matrícula, source; "Encerrar matrícula"),
  **Convites** (003/017 list: situation and delivery, "Reenviar", "Cancelar") and **Disciplinas** (subject, teacher,
  situation — nothing pedagogical).
- "Adicionar aluno": one e-mail field. On submit the web calls the lookup: found → "Bruna · já tem conta" with
  "Incluir na turma" (→ "Aluno incluído na turma.") ; not found → "Enviar convite" (→ "Convite enviado."); already in
  the cohort → "Esse aluno já está na turma.".

## TEACHER — "Turmas" (`/turmas`, `features/classes`)

- Menu "Turmas" for `disciplinas_turma.visualizar`. List of own disciplinas da turma: "<disciplina> · <turma>", code,
  year, period, situation; search and filters as today.
- `/turmas/nova` "Acrescentar disciplina a uma turma": search field (active cohorts: name, code, year, period, the
  disciplinas they already have with teacher); pick one, pick an own active subject, optional calendar dates. Empty
  search: "Turma não encontrada. Peça ao gestor que a crie." Messages: "Disciplina acrescentada à turma.", "Essa
  disciplina já está nesta turma."
- Class page: title "<disciplina> · <turma>", the tabs of today; a read-only "Alunos" tab (no invite/remove); after
  the calendar's last day (`canChangeStatus`) "Encerrar disciplina", "Reativar" and "Arquivar disciplina" (→
  "Disciplina da turma arquivada."). Before that, no button.

## STUDENT

- "Minhas turmas": sections per ano letivo (most recent first); each cohort once with its disciplinas and teachers,
  "Encerrada" badge on INACTIVE/ARCHIVED cohorts, "Ainda não há disciplinas nesta turma."; each disciplina links to
  `/minhas-atividades?materia=<classId>` (read-only when closed).
- The 026 card: options only from disciplinas whose effective status is ACTIVE.
- Invitation page (`/convite-turma`): "Você foi convidado para a turma <nome> (<código>, <período>)".

## Accessibility

axe (WCAG 2.2 AA) on every new screen; keyboard order: search → results → subject → submit; the lookup result is
announced (`role="status"`).
