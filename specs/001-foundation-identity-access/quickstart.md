# Quickstart: 001 — Foundation, Identity & Access

Roteiro para subir o ambiente e validar os fluxos principais da feature ponta a
ponta. Executado do zero (clone limpo, bancos vazios) em 2026-09-22 (T108).

## Pré-requisitos

- Node.js 24 LTS (`engines` do monorepo) e pnpm 11 (`corepack enable`).
- Docker (PostgreSQL 17 e Mailpit).

## 1. Subir dependências e configurar

```bash
docker compose up -d postgres postgres-test mailpit
cp apps/api/.env.example apps/api/.env      # preencher APP_HMAC_SECRET (openssl rand -base64 48)
cp apps/web/.env.example apps/web/.env.local
pnpm install                                # também gera o Prisma Client (postinstall de apps/api)
pnpm --filter api prisma migrate deploy     # cria tabelas + papéis/permissões de referência
pnpm dev                                    # web em :3000, api em :4000 (via /api no web)
```

Portas ocupadas no host? O compose aceita `POSTGRES_PORT`, `POSTGRES_TEST_PORT`,
`MAILPIT_SMTP_PORT` e `MAILPIT_UI_PORT` (ex.: `POSTGRES_PORT=5434 docker compose up -d …`);
ajuste `DATABASE_URL`/`SMTP_URL` em `apps/api/.env` para as mesmas portas. O Prisma CLI lê
`apps/api/.env` (via `prisma.config.ts`); variáveis já exportadas têm precedência.

Mailpit (caixa de entrada local): <http://localhost:8025>.

A API deve **recusar subir** se faltar variável obrigatória (FR-074):

```bash
APP_HMAC_SECRET= pnpm --filter api start   # → erro listando APP_HMAC_SECRET, exit ≠ 0
```

`start`, `admin:bootstrap` e `maintenance:run` executam o código compilado em
`apps/api/dist/`: `pnpm dev` já o gera; sem ele, rode `pnpm --filter api build` antes.

## 2. Bootstrap do primeiro ADMIN (US3)

```bash
pnpm admin:bootstrap --email admin@example.test --print-link
```

- Abra o link (ou o e-mail no Mailpit), defina a senha → `ADMIN` ativo.
- Rode de novo → `Bootstrap administrativo já realizado` (exit 2).
- Confirme que não há rota HTTP de bootstrap: `curl -X POST localhost:3000/api/admin-bootstrap` → 404.

## 3. ADMIN convida MANAGER (US4)

Entre como ADMIN em <http://localhost:3000/entrar> → **Managers** → convidar
`manager@example.test`. Aceite pelo link do Mailpit definindo a senha.

## 4. MANAGER convida professor (US5, US6)

1. Crie uma conta de aluno em `/cadastro` com `prof@example.test` e verifique o e-mail.
2. Como MANAGER → **Professores** → convidar `prof@example.test`. A resposta é igual à
   de um e-mail novo (não revela o aluno).
3. Abra o convite: o modo é "entre na sua conta". Entre como `prof@example.test` e
   aceite → a mesma conta passa a ter `STUDENT` + `TEACHER`; a senha não mudou.
4. Reabra o mesmo link → convite inválido, nada muda.

## 5. MANAGER não acessa alunos (critério 8)

Chamadas diretas à API com métodos não seguros (`POST`, `PATCH`, `DELETE`) precisam de
`Origin: http://localhost:3000` **e** `Content-Type: application/json` (corpo `{}` quando não
há dados); sem isso a resposta é `403 ORIGIN_NOT_ALLOWED` (proteção CSRF, R6). O web já envia
os dois.

```bash
# com o cookie de sessão do MANAGER
curl -i -b "__Host-devtrack_session=<cookie>" localhost:3000/api/users
# → 403 {"statusCode":403,"code":"FORBIDDEN",...}
```

## 6. Sessões (US2)

Entre em dois navegadores; em `/conta/sessoes` revogue a outra sessão → o outro
navegador recebe 401 na próxima ação. "Sair de todos os dispositivos" derruba ambos.

## 7. Retenção e manutenção (FR-017, FR-076, FR-077)

```bash
pnpm --filter api maintenance:run            # todos os jobs; saída só com contagens
pnpm --filter api maintenance:run --job unverified-accounts
```

- Após um login, `access_records` tem uma linha com o IP; `audit_events` não tem IP.
- Uma conta de aluno não verificada criada há mais de 7 dias (ajuste `created_at`
  no banco de dev) some após o job, com evento `account.unverified_purged`.
- `DELETE FROM audit_events` manual no psql falha (trigger append-only).

## 8. Testes automatizados

```bash
pnpm --filter api test            # unit + integração (usa postgres-test)
pnpm --filter api test:security   # matriz de autorização, replay, concorrência, varredura de segredos
pnpm --filter web test            # inclui axe (WCAG 2.2 AA) e navegação por teclado
pnpm check-types && pnpm lint
```

Resultado esperado: todos verdes; o relatório de rastreabilidade
(`apps/api/test/traceability.spec.ts`) cobre os 28 critérios da spec.
