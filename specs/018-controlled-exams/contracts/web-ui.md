# Web UI Contract: 018

All screens use Design System tokens and components (005), have loading, empty, success, error and
offline states, are keyboard-operable, and show statuses as text, never colour only.

## Teacher

### Banco de Provas (`features/exams`)

- Menu entry "Banco de Provas", next to "Banco de Trabalhos".
- List with filters (situação, disciplina, busca), as the 011 bank.
- Editor: disciplina, ementa, tópicos, título, nota total, questões (1–20). Each question has type,
  enunciado, gabarito, **dificuldade** and **tópicos** (1–3). Values are shown read-only, computed.
- "Aprovar" lists the questions that block it.
- "Criar prova com IA": the 011 dialog with quantity up to 20; unavailable state when the agent is
  off ("A geração com IA não está disponível. Crie a prova manualmente.").

### Aplicar prova (`features/activities`)

- Source "Prova do banco" (approved only).
- Fields: duração (min), limite de inatividade (s), abertura, limite para iniciar (min).
- **Cobertura**: two tables (por tópico, por dificuldade: questões e pontos); out-of-scope topics
  flagged with text "Fora do escopo ensinado" and the 012 acknowledgement checkbox.
- No mode, help or release options.

### Prova em andamento (`features/exam-session`)

The activity detail of an EXAM opens on "Chamada e prova": the 016 checklist/room panel with exam
columns, refreshed every 5 s.

| examStatus | Badge | Action |
|---|---|---|
| `NOT_MARKED` | "Não marcado" | "Marcar presente" |
| `PRESENT` | "Presente — pode iniciar até HH:MM" | "Desmarcar" |
| `START_CLOSED` | "Não iniciou (prazo para iniciar encerrado)" | — |
| `ANSWERING` | "Respondendo — n min restantes — k ocorrência(s)" | "Pausar aluno" |
| `PAUSED` | "Pausado — desde HH:MM — n min restantes" | "Liberar retorno" |
| `AWAITING_DECISION` | "Encerrada por avisos — aguardando decisão" | "Ver ocorrências", "Confirmar cancelamento", "Devolver prova" (only `canReturn`) or "Não cancelar" (after the end) |
| `SUBMITTED` / `TIME_EXPIRED` / `ENDED_BY_WARNINGS` / `CANCELLED` | "Entregou" / "Tempo esgotado" / "Encerrada por avisos — não cancelada" / "Cancelada — nota zero" | — |

- Awaiting-decision rows sort first.
- "Confirmar cancelamento" opens a confirm dialog: "Cancelar a prova de <nome>? A nota será zero.
  Esta decisão é registrada."
- "Ver ocorrências" lists each one: número, tipo ("Saiu da tela", "Saiu da tela cheia", "Tentou
  copiar/colar", "Sem interação por n s"), horário.
- "Liberar resultado" is disabled with the text "n decisão(ões) pendente(s)" while holds are open.
- No text uses "fraude", "cola" or "violação" (FR-032; a web scan test pins it).

### Correção (012 review)

- Header: início, fim, motivo do fim; sections "Ocorrências" (with ordinal) and "Saídas da sala".

## Student (`features/exam-attempt`)

- **Rules screen** before the start: duração; "Sair da tela, sair da tela cheia, copiar, colar ou
  ficar n s sem interagir conta como ocorrência"; "Você recebe até 3 avisos; na 4ª ocorrência a
  prova é encerrada e o professor decide se ela é cancelada, com nota zero"; "Se precisar sair da
  sala, chame o professor; o tempo continua correndo"; "Não há ajuda da IA". Primary button
  "Li as regras e quero iniciar" (enters fullscreen).
- **Exam Mode header**: título, progress, `ExamTimer` "mm:ss restantes" (`role="timer"`), save
  status.
- **Alerts**: "Faltam 10 minutos." and "Faltam 5 minutos." (`role="status"`, non-blocking);
  last 10 s a centered `FinalCountdown` 10…1 (`role="alert"`, announced once).
- **Warning dialog**: "Aviso n de 3 — <tipo da ocorrência>. Na 4ª ocorrência a prova será
  encerrada." with "Voltar à prova" (returns to fullscreen).
- **Hold**: "Prova encerrada por excesso de avisos; o cancelamento com nota zero será confirmado
  pelo professor". On return (polling): "O professor devolveu a sua prova. Restam n minutos." with
  "Retomar" (fullscreen).
- **Pause**: "Prova pausada pelo professor. O tempo continua correndo."
- **Time over**: "Tempo esgotado. Suas respostas salvas foram registradas."
- **Decided after a hold, before the release** (cancelled or not): "Prova encerrada. O resultado
  aparece quando o professor liberar." The teacher's decision is never shown before the release.
- **Cancelled, after the release**: "Prova cancelada pelo professor." with the grade 0.
- **Start closed**: "O prazo para iniciar esta prova terminou. Fale com o professor."
- In the last minute, each change saves immediately (no debounce).
