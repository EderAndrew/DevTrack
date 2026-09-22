# Quickstart: 002 — Refatoração de alinhamento de stack da Fase 001

Roteiro para validar a feature depois da implementação. Pré-requisitos e ambiente:
os mesmos da Fase 001 (`specs/001-foundation-identity-access/quickstart.md`) — Node 24,
pnpm 11, Docker. Portas ocupadas no host podem ser trocadas com `POSTGRES_PORT`,
`POSTGRES_TEST_PORT` e `MAILPIT_*_PORT`.

## 1. Clone limpo compila sem passo extra

```bash
pnpm install                     # gera o Prisma Client (postinstall da API)
pnpm build                       # compila packages/contracts antes de api e web
ls packages/contracts/dist       # index.js + index.d.ts
test ! -d packages/ui && echo "packages/ui removido"
```

Esperado: `pnpm build` termina sem erro; nenhum passo manual para compilar o pacote de
contratos (edge case "Build do monorepo").

## 2. Qualidade e testes (o mesmo que a CI roda)

```bash
docker compose up -d postgres-test
cp -n apps/api/.env.test.example apps/api/.env.test
pnpm lint
pnpm check-types
pnpm test
```

Esperado:

- API: todos os testes da Fase 001 passam, agora com o interceptor de conformidade
  conferindo cada resposta contra o contrato (US1-2, US2-1, SC-001).
- `packages/contracts`: guardas de fronteira, duplicação e versão única de Zod passam
  (US1-4, US1-5, US1-6, SC-002).
- Web: axe e teclado (`SC-012`) em todas as telas, contraste dos tokens e tabela de
  mensagens da Fase 001 (SC-004, SC-005).

## 3. Um contrato alterado quebra o outro lado (US1-3, SC-003)

```bash
# Renomeie um campo de resposta, por exemplo name → fullName em ManagerViewSchema
# (packages/contracts/src/provisioning/managers.ts), e rode:
pnpm build --filter @repo/contracts && pnpm check-types
```

Esperado: `check-types` falha em `apps/api` (mapeador de view) e em `apps/web`
(tela de gestores). Desfaça a alteração.

## 4. Lint impede componente chamando a API (US4-5)

Adicione temporariamente `import { apiClient } from "@/lib/api/client";` num arquivo de
`apps/web/features/managers/components/` e rode `pnpm --filter web lint`.
Esperado: erro de `no-restricted-imports`. Desfaça.

## 5. Sistema no ar: aparência e comportamento iguais (US2, US3, US4)

```bash
POSTGRES_PORT=5434 docker compose up -d postgres postgres-test mailpit   # porta conforme seu ambiente
pnpm --filter api prisma migrate deploy
pnpm dev                          # web :3000, API :4000, Mailpit :8025
```

Percorra o roteiro §2–§6 do quickstart da Fase 001 (bootstrap do ADMIN, convite de
MANAGER, convite de professor para aluno existente, bloqueio do MANAGER em
`/api/users`, sessões). Confira também:

- textos, rótulos e mensagens iguais aos da Fase 001; tema escuro do sistema aplicado;
- em `/conta/sessoes`, revogar outra sessão remove a linha sem recarregar a página;
- em `/admin/managers`, convidar, reenviar e revogar atualizam as tabelas sem
  recarregar;
- sair e entrar com outro usuário na mesma aba não mostra nada do anterior (US4-4).

## 6. E2E (US5, SC-006)

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter web exec playwright install chromium   # só na primeira vez
pnpm --filter web test:e2e
```

Esperado: as 7 especificações de `apps/web/e2e/` passam em até 10 minutos, usando o
banco `devtrack_e2e` (recriado a cada execução) e as portas 3100/4100 — não interfere
num `pnpm dev` aberto nem no banco de desenvolvimento.

## 7. CI (SC-009)

Abra um pull request da branch `002-stack-alignment`. Esperado: o workflow **CI**
roda lint, tipos, build e testes e fica verde. Para conferir a falha, um commit que
quebre um teste deixa o status vermelho.

## 8. Dependências (SC-008)

```bash
pnpm audit --prod --audit-level high
pnpm licenses list --prod
```

Esperado: nenhuma vulnerabilidade alta ou crítica; cada dependência direta nova
aparece em `DEPENDENCIES.md` com licença e justificativa.
