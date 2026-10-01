# Quickstart: 012 — Portal do Aluno

Setup as in the root `CLAUDE.md` (Docker services, `.env`, `pnpm install`, `prisma migrate
deploy`, `pnpm build`). No AI key is needed: nothing in 012 calls a model.

## Run the cycle by hand

1. `pnpm --filter api dev` and `pnpm --filter web dev`.
2. As a teacher with a subject, a confirmed syllabus and a class of that subject:
   - approve a work in "Banco de Trabalhos" (011) or 3 exercises in "Banco de Exercícios" (010);
   - invite a student to the class (003) and accept the invitation from Mailpit
     (http://localhost:8025).
3. Teacher: `/turmas/<id>/atividades` → "Nova atividade" → Trabalho → the work → prazo for
   tomorrow, "Aceitar e marcar como atrasada" → the scope list (no plan or no completed topic
   flags everything) → confirm → "Publicar atividade".
4. Student: log in → lands on `/painel` with 1 pendente → "Iniciar" → answer, watch
   "Salvando…" / "Resposta salva", reload the page, log out and in again (answers are there) →
   "Entregar atividade" → confirm → "Atividade entregue em …".
5. Teacher: the activity's roster shows "Entregou" → open the attempt → multiple choices already
   "Corrigida automaticamente"; grade the open answer and the code, add feedback → "Salvar
   correção" → "Liberar resultado".
6. Student: `/historico` → the activity "Corrigida" with the grade → open it to see grade and
   feedback per question, never the answer key.

Offline check: on the answering page, DevTools → Network → Offline, type an answer (the offline
alert shows, the answer stays), go back Online (it is sent; "Resposta salva").

## Tests

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter api test test/integration/012-us3-answering.spec.ts     # one story
pnpm --filter api test -t "012/"                                     # every 012 test
pnpm --filter api test:security                                      # includes 012-isolation, -student-view, -concurrency
pnpm --filter @repo/contracts test
pnpm --filter web test
pnpm --filter web test:e2e                                           # student-portal.spec.ts (local only)
```

The suites to look at first: `src/modules/activities/status/*.spec.ts` (every status and
operation rule), `test/security/012-student-view.spec.ts` (answer-key markers in every student
response, before and after release), `test/security/012-concurrency.spec.ts` (10 parallel starts
and submits, save × submit, close × submit) and `test/security/012-isolation.spec.ts`.
