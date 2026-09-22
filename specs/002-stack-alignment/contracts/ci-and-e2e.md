# Contract: integração contínua e testes E2E

Decisões: [research.md](../research.md) S14–S15. Clarificação Q2 → C: a CI roda lint,
tipos, build e testes; o E2E roda localmente.

## Integração contínua — `.github/workflows/ci.yml`

| Item | Valor |
|------|-------|
| Gatilhos | `push` (todas as branches) e `pull_request` |
| Permissões | `contents: read` |
| Concorrência | `group: ci-${{ github.ref }}`, `cancel-in-progress: true` |
| Runner | `ubuntu-latest`, `timeout-minutes: 20` |
| Serviço | `postgres:17`, porta `5433:5432`, `POSTGRES_DB=devtrack_test`, usuário/senha de `apps/api/.env.test.example`, healthcheck `pg_isready` |
| Node / pnpm | `actions/setup-node` com Node 24 e cache `pnpm`; `pnpm/action-setup` lendo `packageManager` |
| Actions | fixadas por SHA de commit, com a versão em comentário (`# v4.x.y`) |
| Segredos | nenhum |

Passos, em ordem (qualquer falha encerra o job com falha):

1. `actions/checkout`
2. `pnpm/action-setup`
3. `actions/setup-node`
4. `pnpm install --frozen-lockfile` (executa `prisma generate` pelo `postinstall` da API)
5. `cp apps/api/.env.test.example apps/api/.env.test`
6. `pnpm lint`
7. `pnpm check-types`
8. `pnpm build`
9. `pnpm test` (API contra o serviço Postgres; web com jsdom; guardas do pacote de
   contratos)

Critério de aceite (SC-009): um PR que quebre qualquer um dos passos 6–9 fica com o
status de verificação em falha.

## E2E — `pnpm --filter web test:e2e`

| Item | Valor |
|------|-------|
| Local | `apps/web/e2e/` (`playwright.config.ts`, `global-setup.ts`, `fixtures/`, `*.spec.ts`) |
| Navegador | Chromium (instalado com `pnpm --filter web exec playwright install chromium`) |
| Pré-requisitos | `docker compose up -d postgres-test mailpit`; `pnpm build` |
| Banco | `devtrack_e2e` no contêiner `postgres-test`, recriado por `prisma migrate reset --force` no *global setup* |
| API | `webServer`: `node dist/main.js` em `apps/api` com `apps/web/e2e/.env.e2e` (PORT=4100, `WEB_ORIGIN=http://localhost:3100`, `DATABASE_URL` do banco E2E, SMTP do Mailpit) |
| Web | `webServer`: `next start --port 3100` com `API_ORIGIN=http://localhost:4100` |
| E-mail | API HTTP do Mailpit (`http://localhost:8025/api/v1/…`), filtrando pelo destinatário único da jornada |
| Primeiro ADMIN | criado uma vez no *global setup* com `pnpm --filter api admin:bootstrap --email <único> --print-link` (variáveis do `.env.e2e` no ambiente do processo, que têm precedência sobre `apps/api/.env`) e ativado pela tela; as jornadas que precisam de ADMIN ou MANAGER partem dele |
| Tempo | ≤ 10 minutos no total (SC-006) |

`.env.e2e` é versionado e contém só valores de exemplo (nenhum segredo real), com
`NODE_ENV=development`, como o ambiente local. O cookie de sessão é sempre
`__Host-…; Secure` (`apps/api/src/modules/auth/session-cookie.ts`); o Chromium trata
`http://localhost` como contexto seguro e aceita esse cookie, que é como o
desenvolvimento local já funciona hoje. Por isso API e web do E2E usam `localhost`, não
`127.0.0.1` nem outro host.

## Jornadas

| Arquivo | Jornada | Cobre |
|---------|---------|-------|
| `signup.spec.ts` | cadastro → e-mail de verificação → verificar → login → `/conta/sessoes` | US5-1 |
| `signup-keyboard.spec.ts` | a mesma jornada de cadastro só com teclado | US5-2 |
| `admin-manager.spec.ts` | `admin:bootstrap` → ativar ADMIN → convidar MANAGER → aceite → MANAGER entra | US5-1 |
| `teacher-invitation.spec.ts` | aluno cadastrado → MANAGER convida o e-mail → aceite com a sessão do aluno → mesma conta com STUDENT + TEACHER | US5-1 |
| `password-reset.spec.ts` | esqueci a senha → e-mail → redefinir → login com a nova senha; link reaberto é recusado | US5-1 |
| `sessions.spec.ts` | dois logins → revogar o outro → "sair de todos" → sessões recusadas | US5-1 |
| `account-switch.spec.ts` | usuário A vê suas sessões → sai → usuário B entra → nenhum dado de A na tela | US5-3, SC-007 |

Cada teste leva no título o id do cenário (`US5-1`, `US5-2`, `US5-3`) para a
rastreabilidade.
