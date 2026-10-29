# Web UI Contract: 021

Texts in pt-BR, from the features' `schemas/` files; tokens and components of the design system only.

## Apply and options (`features/activities/components/work-options.tsx`)

- Checkbox **"Permitir executar o código"**, unchecked, in the work options fieldset (with the 015 mode
  and help), shown only when the chosen work has `runnableCodeQuestionCount > 0`.
- Description below it: "Os alunos poderão rodar o programa nos casos públicos das questões de Código.
  Os casos privados nunca são executados nem mostrados."
- When `GET /code-runner/availability` says `available: false`: a `warning` notice under the option,
  "A execução está indisponível agora; os alunos verão o botão quando ela voltar." The option stays
  enabled.
- In the options edit of an applied work, locked like the 015 options once a student started (the same
  `WORK_OPTIONS_LOCKED` text).
- Activity list and detail: "Execução de código: permitida" (badge with text) when on; nothing when off.

## Student (`features/student-activities/components/activity-answering.tsx`)

- `CodeRunPanel` (019) on every CODE question with a non-null `execution`, while editable — so on a work
  with the option, in the normal page and in the 015/018 focus page (`features/controlled-attempt`
  renders the same answering component). No other change to the panel or the result.
- Paused (016): the questions are replaced by the paused notice, so the panel is not mounted and stops
  polling.

## Teacher review (`features/code-run/components/code-run-summary.tsx`)

Mounted by `features/activities/components/attempt-review.tsx` under each CODE question when the
activity has `codeExecution`:

- Heading "Execuções do aluno" (h4 inside the question).
- "Nenhuma execução" when `runCount = 0`.
- Otherwise "n execuções" and, from `lastFinished`:
  - EXECUTED: "Última execução: p de m casos públicos passaram" with the date/time
    (`formatLongDateTime`), and a list "Caso k: <verdict in words>" (the 019 verdict labels and icons);
  - COMPILATION_ERROR: "Última execução: erro de compilação";
  - FAILED: "Última execução: não foi possível executar".
- "Uma execução em andamento" when `pending`.
- A note: "Execuções são um registro do aluno; não mudam a nota."
- No code, input, output or stderr anywhere. Loading: `Skeleton`; error: the catalog message.

## Accessibility

Keyboard only and screen reader in the focus page (SC-008); verdicts in words with an icon, never color
alone; the summary is a list with an accessible heading; axe clean.
