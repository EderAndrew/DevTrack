# Web UI Contract: 019

All text is Portuguese and lives in the web (`features/code-run`, `features/exercises`,
`lib/messages/error-messages.ts`). States are said in words, never by colour alone. Program output,
stderr and compiler messages are rendered as text in `CodeBlock` (plain, no highlighting), never as HTML.

## Student — exercise CODE question (`features/code-run`, mounted by `activity-answering.tsx`)

Below the editor and the public cases (012):

- `execution.status = AVAILABLE`: button **"Executar"** (primary, `Play` icon) and the line
  "Executa o seu código com os casos públicos. Não vale pontos nem conclui o exercício." Help text
  with the convention ("Leia da entrada padrão e escreva na saída padrão." / "Em Java, a classe deve se
  chamar `Main`."), the language version and the limits ("até 2 s por caso, 256 MB").
- `UNAVAILABLE`: no button; "Execução indisponível no momento. Você pode continuar respondendo e
  concluir normalmente."
- `NO_PUBLIC_CASES`: "Este exercício não tem casos para executar."
- `NOT_SUPPORTED` or `null`: nothing.

While a run is pending the button reads "Executando…" (disabled, `aria-busy`), with "Na fila" or
"Executando" in a `role="status"` region.

If `POST` returns a run whose `questionId` differs from the panel's question: "Há uma execução em
andamento em outra questão. Aguarde o resultado dela." in the status region; the panel polls that run
only to re-enable "Executar" when it ends, without showing its result.

**Result** (`CodeRunResult`, `aria-live="polite"` summary):
- summary: "2 de 3 casos públicos passaram" (only public cases are ever counted);
- compilation error: "Erro de compilação" and the message;
- per case (list, collapsible, first failing case open): "Caso 1 — Passou" / "Saída diferente" /
  "Erro de execução" / "Tempo esgotado" / "Memória excedida" / "Saída grande demais", with icon +
  word; "Entrada", "Saída esperada", "Saída obtida" (side by side on desktop, stacked on phone),
  "Saída de erro" when present, "Tempo: 123 ms";
- `FAILED`: "Não foi possível executar agora. Tente de novo.";
- stale: "Este resultado é de uma versão anterior do seu código." when the editor differs from
  `sourceCode`;
- purged: no result shown.
- `429`: "Muitas execuções seguidas. Tente de novo em N s." (from `Retry-After`).

"Executar" never saves, concludes or changes the answer; autosave keeps working as in 012.
The comparison rule is explained in a disclosure "Como a saída é comparada": "Espaços no fim das linhas
e linhas vazias no final são ignorados; o resto precisa ser igual."

## Teacher — exercise form (`features/exercises`)

CODE exercises get the section **"Casos de teste"** (after the expected solution):
- each case: "Entrada" (`Textarea`, monospace), "Saída esperada" (`Textarea`), "Visibilidade" radio
  "Público — o aluno vê e pode executar" / "Privado — fica só no servidor";
- "Adicionar caso" (disabled at 20, with "Máximo de 20 casos"), "Remover", "Mover para cima/baixo";
- next to the language select: "Os alunos poderão executar o código." or "Sem execução nesta
  linguagem.";
- exercise detail lists the cases with their visibility.

## Keyboard and accessibility

"Executar" is reachable by Tab right after the editor (Esc then Tab leaves the editor, 014); the
result's summary is announced; each case header is a button with `aria-expanded`. Guards:
`vitest-axe` on the panel and the form section; `student-portal-xss.test.tsx` extended with output,
stderr and compiler messages containing HTML.
