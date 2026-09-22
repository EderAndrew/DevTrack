# Implementation Plan: 002 — Refatoração de alinhamento de stack da Fase 001

**Branch**: `002-stack-alignment` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-stack-alignment/spec.md`

## Summary

Migrar a Fase 001 para a Constituição v2.1.0 sem mudar o comportamento:

1. Criar `packages/contracts` (`@repo/contracts`), um pacote ESM compilado com `tsc`
   para `dist/`. Ele passa a guardar os schemas Zod de todas as entradas e respostas
   das 38 rotas da API, os enums públicos, os códigos de erro e o catálogo de
   endpoints.
2. A API troca os schemas locais e as interfaces de view por esse pacote. Um
   interceptor, registrado só nos testes, confere cada resposta real contra o
   contrato.
3. O web é reorganizado por feature e passa a usar Tailwind 4 e shadcn/ui, com a
   paleta atual mapeada para os tokens do tema. Os dados do servidor passam pelo
   TanStack Query, com o render inicial ainda no servidor, e os formulários pelo React
   Hook Form com os schemas do contrato. As mensagens vêm de um catálogo do próprio web.
4. Testes de guarda impedem que os contratos voltem a ser duplicados ou que invadam
   camadas internas.
5. Entram uma suíte E2E com Playwright, que roda localmente, e uma pipeline do GitHub
   Actions com lint, tipos, build e testes.
6. Remover `packages/ui` e registrar a auditoria das dependências novas.

## Technical Context

**Language/Version**: TypeScript 7.0.2 sobre Node.js 24 LTS (inalterado). A API
continua compilando com SWC para CommonJS; `packages/contracts` compila com `tsc`
para ESM, que a API carrega via `require(esm)` (S1, verificado).
**Primary Dependencies**:
- Existentes: NestJS 11, Prisma 7, Zod 4.6.5, Next.js 16.3, React 19.2.
- Novas no web: `@tanstack/react-query` 5.103, `react-hook-form` 7.88,
  `@hookform/resolvers` 5.9, `tailwindcss`/`@tailwindcss/postcss` 4.3, componentes
  shadcn/ui (CLI 4.21) sobre `radix-ui` 1.6, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react` 1.47.
- Novas no E2E: `@playwright/test` 1.63.

**Storage**: PostgreSQL 17, sem mudança de schema nem migrations (FR-014). O E2E usa
o banco `devtrack_e2e` no contêiner de teste.
**Testing**:
- API: Vitest + supertest contra PostgreSQL real, agora com o interceptor de
  conformidade.
- Web: Vitest + Testing Library + `vitest-axe`, mais os testes de teclado e de
  contraste dos tokens.
- Contratos: Vitest com os testes de guarda.
- Playwright para o E2E.

**Target Platform**: API em Linux (Docker, `node:24-slim`); web em navegadores atuais;
CI em `ubuntu-latest`.
**Project Type**: monorepo web (API + frontend + pacote compartilhado).
**Performance Goals**: sem regressão. O p95 do login continua ≤ 2 s (001/SC-009, teste
existente) e a suíte E2E termina em ≤ 10 min (SC-006).
**Constraints**:
- Nenhuma mudança de comportamento observável: rotas, status, corpos, cookies,
  auditoria, textos (FR-010–FR-013).
- A validação precisa ser equivalente à atual (FR-008).
- Sem Redux (FR-028).
- Sem segredos na CI (FR-037).

**Scale/Scope**:
- 38 rotas e cerca de 45 schemas.
- 11 telas mais a navegação e a página inicial.
- 7 features no web.
- Cerca de 520 testes de API e 104 de web a manter verdes.
- 7 especificações E2E.

Nenhum item ficou como NEEDS CLARIFICATION: as duas dúvidas da spec foram resolvidas
na sessão de 2026-09-22, e as escolhas técnicas estão em [research.md](./research.md)
(S1–S19).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verificado contra `.specify/memory/constitution.md` v2.1.0:

- [x] ✅ **I. Security**: a API continua validando toda entrada, agora com os schemas do contrato, em `strictObject` (campo desconhecido → 400). Tokens de URL não são persistidos no cliente, e o cache é limpo no logout e em respostas 401. As actions da CI são fixadas por SHA, e a auditoria de dependências é refeita.
- [x] ✅ **II. RBAC**: nenhuma permissão nova. A matriz da Fase 001 e o teste `route-declarations` continuam valendo, e o web continua usando `permissions` só para UX.
- [x] ✅ **III. Server authority**: nenhuma regra muda de lado. O render inicial e a checagem de sessão continuam no servidor.
- [x] N/A **IV. Untrusted code**
- [x] ✅ **V. Data integrity**: sem mudança de schema nem migrations.
- [x] ✅ **VI. Audit & logs**: os 29 eventos continuam emitidos (`audit-coverage.spec.ts`), e a varredura de segredos continua rodando. O interceptor de conformidade não registra valores, só os caminhos dos campos inválidos.
- [x] ✅ **VII. Tests**: a suíte da Fase 001 é mantida como prova de não regressão, e entram as guardas do XXVI, o interceptor de conformidade, o teste de contraste, o catálogo de mensagens, o E2E e a CI.
- [x] ✅ **VIII. Layering**: controllers continuam finos, e no web uma regra de lint impede componentes de chamarem a API. Os tipos Prisma não saem da API.
- [x] ✅ **IX. Simplicidade**: cada dependência nova é uma linha da tabela de stack da constituição ou é exigida pelos componentes shadcn (S17). Redux e `@axe-core/playwright` ficaram de fora, e o pacote é compilado com o `tsc` que já está no monorepo.
- [x] N/A **X–XV** (sem eventos pedagógicos, decisões críticas, automação ou IA)
- [x] ✅ **XVI. Explicit states**: os estados continuam os mesmos, agora como enums públicos no contrato.
- [x] ✅ **XVII. Idempotency**: as garantias da API não mudam, e o envio duplicado de formulário continua bloqueado.
- [x] N/A **XVIII–XIX**
- [x] ✅ **XX–XXIII**: N/A, sem domínio pedagógico.
- [x] ✅ **XXIV. Academic isolation**: as regras de 403 × 404 da Fase 001 não mudam.
- [x] ✅ **XXV. Privileged provisioning**: os fluxos não mudam e continuam cobertos pelos testes da Fase 001 e pelo E2E.
- [x] ✅ **XXVI. Shared contracts**: é o objetivo da feature (S1–S8). O pacote guarda só a fronteira, os tipos vêm de `z.infer`, há guardas de duplicação e de fronteira, a versão de Zod é única (via catálogo), as mensagens ficam no web e a API continua validando.
- [x] ✅ **Frontend stack**:
  - Tailwind + shadcn + Lucide, TanStack Query para dados do servidor, RHF + resolvers e `fetch` nativo.
  - Vitest, RTL, `vitest-axe` e Playwright nos testes.
  - Código organizado em `features/`, sem `src/`.
  - Redux fica de fora com justificativa (FR-028).

**Resultado**: aprovado, sem violações. *Complexity Tracking* vazio.

**Re-check pós-design (Phase 1)**: aprovado. O design (contratos, arquitetura do web,
CI/E2E) não criou nada que não esteja previsto na constituição. Três pontos foram
conferidos:
- O interceptor de conformidade só existe nos testes.
- `radix-ui`, `class-variance-authority`, `clsx` e `tailwind-merge` entram como
  dependências dos componentes shadcn, e não como escolhas de stack paralelas.
- `DEPENDENCIES.md` sobe para a raiz do repositório porque passa a cobrir o monorepo.

## Project Structure

### Documentation (this feature)

```text
specs/002-stack-alignment/
├── plan.md                      # este arquivo
├── research.md                  # S1–S19
├── data-model.md                # schemas do contrato, enums, catálogo de mensagens, chaves de query, tokens
├── quickstart.md                # roteiro de validação
├── contracts/
│   ├── contracts-package.md     # interface do @repo/contracts + catálogo das 38 rotas
│   ├── web-architecture.md      # pastas, camadas, cache, formulários, componentes
│   └── ci-and-e2e.md            # workflow da CI e suíte Playwright
├── checklists/requirements.md
└── tasks.md                     # /speckit-tasks (ainda não criado)
```

### Source Code (repository root)

```text
.github/workflows/ci.yml                     # novo (S15)
pnpm-workspace.yaml                          # + catalog: zod (S2)
turbo.json                                   # check-types/dev dependem de ^build (S16)
DEPENDENCIES.md                              # movido de apps/api/, cobre o monorepo (S17)

packages/
├── contracts/                               # novo (S1, S3, S6, S7)
│   ├── src/{common,auth,me,accounts,provisioning,admin-activation,health}/
│   ├── src/endpoints.ts
│   ├── src/index.ts
│   └── test/{boundary,duplication,zod-version}.spec.ts
├── eslint-config/                           # inalterado
├── typescript-config/                       # inalterado
└── ui/                                      # removido (FR-040)

apps/api/
├── Dockerfile                               # pnpm --filter "api..." build (S16)
├── src/platform/http/schemas.ts             # removido → @repo/contracts
├── src/platform/http/errors.ts              # ErrorCatalog satisfies Record<ErrorCode, …> (S8)
├── src/modules/**/*.controller.ts           # schemas de @repo/contracts (S5)
├── src/modules/**/*.service.ts, *.view.ts   # tipos de retorno do contrato; datas → ISO (S4)
└── test/
    ├── helpers/contract-conformance.interceptor.ts   # novo (S6)
    ├── helpers/test-app.ts                          # registra o interceptor
    └── contracts/endpoint-catalog.spec.ts           # novo (S6)

apps/web/
├── app/                                     # rotas (Server Components) + layout + providers.tsx
├── features/{auth,sessions,admin-activation,invitations,managers,accounts,teachers}/
│   └── {api,components,hooks,schemas,types}/
├── components/{ui,shared}/                  # shadcn + Field/ErrorSummary/SubmitButton/…
├── lib/{api,query,messages}/, lib/utils.ts
├── components.json, postcss.config.mjs      # shadcn + Tailwind 4
├── test/{a11y,keyboard,contrast,render}.*
└── e2e/                                     # Playwright (S14)
```

**Structure Decision**: monorepo existente (pnpm + Turborepo). Muda o seguinte:
- entra o pacote `packages/contracts`;
- sai o `packages/ui`;
- `apps/web` passa a ser organizado por feature, com `app/` na raiz e sem `src/`;
- a CI fica em `.github/workflows/`.

A API mantém a estrutura de módulos da Fase 001; nela mudam só as importações de
schemas e de tipos.

## Implementation Order

Na ordem abaixo, cada etapa termina com a suíte inteira verde:

1. **Contratos (US1)**:
   - pacote, catálogo de Zod, Turbo e Dockerfile;
   - schemas e catálogo de endpoints;
   - interceptor e teste de catálogo na API;
   - API migrada para os schemas e tipos do contrato;
   - guardas.

   Critério de saída: a suíte de API da Fase 001 passa com as asserções intactas.
2. **Web, fundação (US3/US4)**:
   - Tailwind, tokens, shadcn e `components/shared`;
   - `lib/api`, `lib/query`, `lib/messages` e `providers`;
   - `renderWithProviders`;
   - testes de contraste e do catálogo de mensagens;
   - regras de lint.
3. **Web, telas por feature (US3/US4)**, uma feature por vez, cada uma com os seus
   testes migrados:
   - `auth`, `sessions`, `admin-activation` e `invitations`;
   - depois `managers`, `accounts` e `teachers`.

   Ao final, remover `lib/*-api.ts`, `components/form` e `packages/ui`.
4. **E2E (US5)**: configuração do Playwright, *global setup* e as 7 jornadas.
5. **CI (US5-5)**: workflow, uma primeira execução verde e uma falha provocada.
6. **Encerramento**:
   - `DEPENDENCIES.md` (auditoria e licenças);
   - README, CLAUDE.md e quickstart;
   - quickstart da Fase 001 refeito num worktree limpo.

## Risks

| Risco | Mitigação |
|-------|-----------|
| Diferença sutil de validação ao mover os schemas | Mover o código dos schemas sem reescrever; as suítes US1-2, US7 e de autorização da Fase 001 detectam diferenças |
| Uma resposta real hoje diverge da documentação da 001 | O interceptor aponta a rota; corrige-se a documentação da 001 primeiro (Assumption da spec) e só então o contrato |
| Testes de tela dependem de detalhes do markup antigo | As consultas são por papel e rótulo, que não mudam; o markup é mantido onde os testes de teclado dependem da ordem |
| shadcn/Radix muda a semântica de algum controle | Só componentes simples (`button`, `input`, `label`, `table`, `alert`); o axe e os testes de teclado rodam em todas as telas |
| E2E instável com Mailpit compartilhado | Destinatários únicos por execução; espera por e-mail com *polling* e tempo-limite |
| `require(esm)` do pacote na imagem Docker | A imagem já usa Node 24; o passo de build do Dockerfile passa a compilar o pacote antes da API |

## Complexity Tracking

Sem violações da constituição a justificar.
