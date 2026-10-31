# Contract: web UI

Two features, apart from the banks: `apps/web/features/activities` (teacher) and
`apps/web/features/student-activities` (student), each with `api/components/hooks/schemas`;
neither imports `features/works` or `features/exercises`. Design-system components only,
Portuguese labels, axe and keyboard tests (SC-012 pattern, `SC-009` of this spec) on every page,
distinct loading / empty / error / offline states (FR-033, SC-010). Dates as "sexta-feira,
10 de outubro, 23:59" in the browser's time zone; grades with a comma ("0,45 de 0,50").

## Student (student layout)

Amendment 2026-10-31: on "Minhas atividades" each card also shows, larger on its right in the rounded brand font, the
released grade of a work or exam, or an exercise's points ("Pontos parciais" until it is concluded and corrected; 013: never
a grade). Nothing before the release; the unfinished exercise shows only points already earned, never a score of open answers.

Menu: Painel, Minhas atividades, Histórico, Minhas turmas, Meu perfil. Start page `/painel`
(research P23).

| Route | Page |
|-------|------|
| `/painel` | "Olá, {primeiro nome}"; four counters (Pendentes, Em andamento, Atrasadas, Concluídas) as links to the filtered list; "Próximas atividades" (≤ 5, by deadline) and "Atrasadas — ainda aceitam entrega", each card with title, turma/disciplina, tipo, prazo, situação, a "Vence em menos de 48 horas" badge (text + icon) and the action button; empty: "Nenhuma atividade pendente."; error: "Não foi possível carregar suas atividades." + "Tentar novamente" |
| `/minhas-atividades` | List with filters Situação (Todas, Pendentes, Em andamento, Entregues/concluídas, Atrasadas) and Tipo (Todos, Exercício, Trabalho) in the URL; each item: título, resumo, tipo, turma/disciplina, professor, publicada em, prazo, situação, nota (when released), "Com feedback" badge; "Carregar mais" |
| `/minhas-atividades/[id]` | Header (título, turma/disciplina, professor, tipo, publicada em, prazo, situação, nota total, instructions). Before starting: "Iniciar atividade". Answering (NORMAL mode of the Exam Mode contract): `ExamProgress`, `QuestionNavigator`, `QuestionHeader` (Questão N, tipo, "Vale 0,17"), `QuestionStatement`, `AnswerArea` (radio alternatives; textarea with counter; `CodeEditor` with the starter code, language and "Casos de teste públicos" read-only), `SaveStatus`, footer Anterior / Próxima / "Entregar atividade" → `AlertDialog` "Tem certeza de que deseja entregar esta atividade? Depois de entregue, não será possível alterar as respostas." with "N questões em branco". Deadline warnings at 10 and 1 minute (`Alert`, announced once). Offline: `Alert` "Você está sem conexão. Suas respostas ficam guardadas neste navegador e serão enviadas quando a conexão voltar." Conflict: "Esta resposta foi alterada em outra aba. Carregamos a versão mais recente." After submit: `Alert` success "Atividade entregue em {data e hora}." and the read-only answers. Result (when released): nota total, nota and feedback per question, feedback geral. Refusals show the API reason from the error catalog (prazo encerrado, atividade encerrada, já entregue) and keep the answers on screen |
| `/historico` | Completed activities (`status=COMPLETED`): atividade, tipo, turma/disciplina, entregue em (+ "com atraso"), situação, nota and "Com feedback" when released; opens `/minhas-atividades/[id]` |

## Teacher (AppShell, under the class)

The class page (`/turmas/[id]`) gains an "Atividades" link next to Calendário/Planejamento.

| Route | Page |
|-------|------|
| `/turmas/[id]/atividades` | Activities of the class: título, tipo, situação (Agendada, Publicada, Encerrada, Cancelada), prazo, entregas ("12 de 30"), "Correção pendente: 3", "Resultado liberado"; action "Nova atividade" |
| `/turmas/[id]/atividades/nova` | Step 1 — tipo (Trabalho / Exercício) and source: a work of the class's subject (APPROVED) or 1–10 APPROVED exercises (search, checkboxes, order up/down). Step 2 — título (prefilled from the work), instruções, nota total (Exercício only, with each question's "Vale 0,34" from `distributeGrade`), publicar agora / agendar (date and time), prazo, "Entrega atrasada": Não aceitar / Aceitar e marcar como atrasada. Scope: the scope check's list "Tópicos ainda não concluídos no planejamento desta turma" with a required checkbox "Entendo e quero aplicar mesmo assim" (or "Esta turma não tem planejamento"). "Publicar atividade" sends one idempotency key per form |
| `/turmas/[id]/atividades/[activityId]` | Detail: data and edit (título, instruções, prazo, regra de atraso; data de publicação only while scheduled), questions with the answer key (read-only); roster table (aluno, situação, entregue em, nota or "Correção pendente"); actions "Encerrar atividade", "Liberar resultado" (confirmation tells how many submissions are still pending and that they appear once graded), "Cancelar atividade" (`variant="danger"`, explicit text and confirmation). Version conflict: "Esta atividade mudou em outra aba" and reload. **Amendment 2026-10-11**: the title, the situation, the notices and the actions stay above three tabs (`Tabs`, kept in `?aba=`): "Informações" (`informacoes`, default: the data and the edit), "Alunos" (`alunos`: the roster; "Chamada e alunos" with the 016 "Chamada" first on a `PRESENT_ONLY` work) and "Questões e gabarito" (`questoes`). "Voltar" from an attempt opens "Alunos" |
| `/turmas/[id]/atividades/[activityId]/tentativas/[attemptId]` | One student's attempt: answers next to the answer key per question, automatic results marked "Corrigida automaticamente", grade input per question ("0,00 a 0,05") and feedback, feedback geral, "Salvar correção"; a not-submitted attempt is read-only with "Não entregue" and, when the student can no longer submit, "Aceitar como entrega" (confirmation: "As respostas salvas até {data e hora} viram a entrega deste aluno, marcada como atrasada."); previous/next student |

Labels: Exercício, Trabalho; Pendente, Em andamento, Atrasada, Entregue, Corrigida; Não iniciou,
Entregou, Entregou com atraso, Não entregou; Pergunta e resposta, Múltipla escolha, Código.
Statuses always with text (and icon where the Exam Mode contract says so), never color alone.
Student code and texts render as text (no `dangerouslySetInnerHTML`). Error messages come from
`lib/messages/error-messages.ts` keyed by the new codes.

## Design system (research P21)

New foundational components in `apps/web/components/ui/assessment/` following
`design-system/exam-mode.md`: `ExamProgress`, `QuestionNavigator` (states atual, não respondida,
respondida), `QuestionHeader`, `QuestionStatus`, `QuestionStatement`, `MultipleChoiceAnswer`,
`EssayAnswer`, `CodeAnswer` (no execution regions in 012), `CodeEditor`, `SaveStatus`,
`AttemptStatus`, `AssessmentFooter`. Each gets a registry entry, a showcase and a
`components.md` section; `exam-mode.md` notes which ones exist and that `ExamTimer`,
`ReviewFlag`, `ExamAlert` and `FocusViolationWarning` still belong to the exams feature.
