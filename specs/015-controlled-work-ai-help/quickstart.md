# Quickstart: 015 — Trabalho em Modo Controlado com Ajuda da IA

Prerequisites: the root CLAUDE.md setup (Node 24, Docker, `apps/api/.env`, migrations applied),
the constitution at v3.4.0.

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build && pnpm --filter api prisma migrate deploy
pnpm --filter api test -t "015/"                    # stories, schema, security suites
pnpm --filter web test -t "015/"
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:help
                                                    # release gate: test/fixtures/evaluations/work-help/<key>.json
pnpm --filter web test:e2e controlled-work          # E2E with the OpenRouter mock
```

Manual check (`pnpm dev`, OpenRouter key set, `work-helper` enabled in "Operação de IA"):

1. As a teacher, apply an approved work with "Modo controlado" and "Ajuda da IA".
2. As a student of the class, open it, read the notice, "Iniciar em modo controlado": fullscreen,
   no menu.
3. Switch tabs and come back: the warning shows the server time. Try Ctrl+V in an answer: blocked
   with the message.
4. "Pedir ajuda" on a question: ask "qual é a resposta?" → guidance without the answer; the
   counter goes to 2 de 3. Ask something off-topic → refusal, counter unchanged.
5. Submit. As the teacher, open the attempt: the timeline of exits and blocks, and the help per
   question.
