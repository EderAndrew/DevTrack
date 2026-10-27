# Quickstart: 021 — Code Runner nos Trabalhos

## Setup

As in 019:

```bash
docker compose up -d postgres postgres-test mailpit
pnpm --filter api prisma migrate deploy
pnpm build
pnpm --filter api code-runner:images        # first time only
pnpm dev                                    # web :3000, api :4000 and the code-runner worker
```

## Walk-through

1. As a teacher: Banco de Trabalhos → a work with a Código question in Python with cases `3` → `6`
   (Público), `10` → `20` (Público) and `0` → `0` (Privado), plus a Múltipla escolha. Approve it.
2. Apply it to a class: the options show "Permitir executar o código", unchecked. Check it, keep NORMAL
   mode, "Liberar para os presentes" after the call (016). The activity shows "Execução de código:
   permitida".
3. Apply a work with only Múltipla escolha: the option does not appear.
4. As a student: open the work, write `print(int(input()) * 2)` in the Código question, "Executar" →
   "2 de 2 casos públicos passaram". The private case appears nowhere. "Executar" never changes "Salvo".
5. "Sair da sala" → the questions disappear; a forged run request answers `409 ATTEMPT_PAUSED`. As the
   teacher, "Liberar retorno"; the student runs `print(int(input()) * 3)` → "0 de 2". Submit.
6. After the submission, "Executar" is gone and `POST …/code-runs` answers `409 ATTEMPT_NOT_IN_PROGRESS`.
7. As the teacher: open the attempt in the correction: the Código question shows "2 execuções; Última
   execução: 0 de 2 casos públicos passaram", "Caso 1: Saída diferente", "Caso 2: Saída diferente", and
   no code or output. Grade it as usual — nothing is prefilled.
8. Try to uncheck the option now: `409 ACTIVITY_ALREADY_STARTED` ("…já iniciou").
9. Apply the same work again in CONTROLLED mode with the option: the student runs inside the focus page;
   copying from the result is blocked and recorded as in 015.
10. Stop the worker: the apply form warns "A execução está indisponível agora…" and still lets the option
    be checked; the student sees "Execução indisponível no momento" and submits normally.
11. `pnpm --filter api maintenance:run --job code-run-content` with runs older than 24 h: the teacher's
    summary is unchanged.

## Tests

```bash
pnpm --filter api test -t "021/"
pnpm --filter web test -t "021/"
pnpm --filter web test:e2e work-code-runner
```
