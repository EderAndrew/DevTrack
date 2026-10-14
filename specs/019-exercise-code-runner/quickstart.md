# Quickstart: 019 — Code Runner nos Exercícios

## Setup

```bash
docker compose up -d postgres postgres-test mailpit
pnpm --filter api prisma migrate deploy
pnpm build
pnpm --filter api code-runner:images        # pulls the three pinned images (first time only)
pnpm dev                                    # web :3000, api :4000 and the code-runner worker
```

`CODE_RUNNER_ENABLED=true` in `apps/api/.env`. Without Docker running, the worker fails its heartbeat
and the student screen shows "Execução indisponível no momento" (the exercise keeps working).

## Walk-through

1. As a teacher: Banco de Exercícios → "Novo exercício" → Código, linguagem Python ("Os alunos poderão
   executar o código."), código inicial `n = int(input())`, casos: `3` → `6` (Público), `10` → `20`
   (Público), `0` → `0` (Privado). Aprovar.
2. Apply it to a class as a Exercise activity (012/013).
3. As a student: open the activity, the editor shows the starter code. Write `print(int(input()) * 2)`,
   "Executar": "Na fila" → "2 de 2 casos públicos passaram". The private case appears nowhere.
4. Change to `print(int(input()) * 3)`: the result says it is from an earlier version; "Executar":
   "0 de 2", each case "Saída diferente" with expected and obtained.
5. `print(` → "Erro de compilação". `while True: pass` → "Tempo esgotado".
6. Click "Executar" 11 times in a minute → "Muitas execuções seguidas…".
7. Stop the worker (`Ctrl+C` on its task or `docker` down): after 15 s the button turns into
   "Execução indisponível no momento"; "Concluir exercícios" still works and the result is "Aguardando
   correção" as in 013.

## Tests

```bash
pnpm --filter api test -t "019/"                 # pure + integration + security with FakeSandbox
pnpm --filter api test:sandbox                   # real Docker: languages, hostile suite, SC-001 timing
pnpm --filter web test -t "019/"
pnpm --filter web test:e2e code-runner           # E2E with the real worker
pnpm --filter api maintenance:run --job code-run-content
```
