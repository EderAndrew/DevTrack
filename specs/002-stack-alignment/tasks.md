---

description: "Task list for 002 — Refatoração de alinhamento de stack da Fase 001"
---

# Tasks: 002 — Refatoração de alinhamento de stack da Fase 001

**Input**: Design documents from `/specs/002-stack-alignment/`
**Prerequisites**: plan.md, spec.md, research.md (S1–S19), data-model.md, contracts/
(contracts-package, web-architecture, ci-and-e2e), quickstart.md

**Tests**: obrigatórios (Constituição, Princípio VII, e o próprio escopo da feature).
A suíte da Fase 001 é a prova de não regressão (SC-001) e **suas asserções não
mudam**. As mudanças nos testes existentes se limitam a importações e helpers (US2-1).
Os testes novos são escritos antes da implementação e falham antes dela. Os títulos
de `describe`/`it` dos testes novos levam o id da spec 002 com prefixo (`002/US1-2`,
`002/SC-004`), para não se confundirem com os ids da Fase 001, que
`apps/api/test/traceability.spec.ts` continua procurando.

**Organization**: tarefas agrupadas por user story. Cada fase termina com
`pnpm lint && pnpm check-types && pnpm test` verde (plan.md, "Implementation Order").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US5)
- Caminhos relativos à raiz do repositório

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: criar o pacote de contratos e ligar o monorepo a ele, sem mover código ainda.

- [ ] T001 Adicionar `catalog: { zod: ^4.6.5 }` em `pnpm-workspace.yaml` e trocar `zod` em `apps/api/package.json` por `"zod": "catalog:"` (S2)
- [ ] T002 Criar `packages/contracts/package.json` exatamente como em `contracts/contracts-package.md` §Pacote (ESM, `exports` com `types`/`default`, scripts `build`/`dev`/`check-types`/`lint`/`test`, `"zod": "catalog:"`, devDependencies `@repo/typescript-config`, `@repo/eslint-config`, `typescript`, `vitest`, `eslint` nas mesmas versões de `apps/api`)
- [ ] T003 [P] Criar `packages/contracts/tsconfig.json` (estende `@repo/typescript-config/base.json`, `module`/`moduleResolution` `NodeNext`, inclui `src` e `test`, `noEmit`) e `packages/contracts/tsconfig.build.json` (só `src`, `outDir: dist`, `declaration: true`, `rootDir: src`) (S1)
- [ ] T004 [P] Criar `packages/contracts/vitest.config.ts` (ambiente node, `test/**/*.spec.ts`) e `packages/contracts/eslint.config.mjs` (base do `@repo/eslint-config` + `no-restricted-imports` para `@prisma/*`, `@nestjs/*`, `react`, `react-dom`, `next`, `next/*`, `@reduxjs/*`, `express` e caminhos contendo `apps/`) (S7)
- [ ] T005 Criar `packages/contracts/src/index.ts` vazio (`export {};`) e `packages/contracts/.gitignore` com `dist/`; rodar `pnpm --filter @repo/contracts build` e confirmar `dist/index.js` + `dist/index.d.ts`
- [ ] T006 Atualizar `turbo.json`: `check-types` e `dev` passam a depender de `^build`; `build` com `outputs` incluindo `dist/**` (S16)
- [ ] T007 Adicionar `"@repo/contracts": "workspace:*"` em `dependencies` de `apps/api/package.json` e de `apps/web/package.json`, e `"zod": "catalog:"` em `apps/web/package.json`; rodar `pnpm install` e confirmar que `pnpm build` compila o pacote antes de api e web
- [ ] T008 Trocar `pnpm --filter api build` por `pnpm --filter "api..." build` em `apps/api/Dockerfile` e confirmar que o estágio de `pnpm deploy` inclui `packages/contracts/dist` (S16)

**Checkpoint**: `pnpm build`, `pnpm check-types` e `pnpm test` verdes; nada mudou de comportamento.

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: primitivos, enums e códigos de erro do contrato, usados por API (US1),
catálogo de mensagens (US2) e formulários (US4).

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [ ] T009 [P] Escrever `packages/contracts/test/primitives.spec.ts` fixando o comportamento atual de `apps/api/src/platform/http/schemas.ts`: e-mail com espaços e maiúsculas vira minúsculas sem espaços; e-mail com 255 caracteres, nome vazio, nome com 121 caracteres, nome com caractere de controle, token com 42/44 caracteres ou fora de `[A-Za-z0-9_-]` e senha com 1025 caracteres são recusados; `UuidSchema` e `IsoDateTimeSchema` aceitam/recusam os casos típicos (FR-008). Deve falhar antes de T010
- [ ] T010 Criar `packages/contracts/src/common/primitives.ts` com `EmailSchema`, `NameSchema`, `TokenSchema`, `PasswordInputSchema`, `UuidSchema`, `IsoDateTimeSchema` e tipos derivados, **copiando o código** de `apps/api/src/platform/http/schemas.ts` sem reescrever regras (data-model §1)
- [ ] T011 [P] Criar `packages/contracts/src/common/enums.ts` com `RoleKeySchema`, `RoleAssignmentStatusSchema`, `AccountStatusSchema`, `InvitationStatusSchema`, `InvitableRoleSchema`, `TeacherStatusSchema`, `AcceptanceModeSchema`, `HealthStatusValueSchema` (`z.enum`) e tipos derivados, com os valores de data-model §2 conferidos contra `apps/api/prisma/schema.prisma`
- [ ] T012 [P] Criar `packages/contracts/src/common/errors.ts` com `ErrorCodeSchema` (os 24 códigos de `apps/api/src/platform/http/errors.ts`, mesma ordem) e `ErrorBodySchema` (`z.strictObject({ statusCode: z.int(), code: ErrorCodeSchema, message: z.string() })`) e tipos `ErrorCode`/`ErrorBody` (S8)
- [ ] T013 Exportar `common/*` em `packages/contracts/src/index.ts` (imports internos com extensão `.js`); rodar `pnpm --filter @repo/contracts test` (T009 verde) e `build`

**Checkpoint**: `@repo/contracts` compila e exporta os primitivos; nenhum consumidor usa ainda.

---

## Phase 3: User Story 1 — Contrato único entre API e web (Priority: P1) 🎯 MVP

**Goal**: toda entrada e resposta das 38 rotas descrita uma vez em `@repo/contracts`;
API valida com esses schemas; respostas reais conferidas nos testes; tipos do web
derivados do pacote; guardas impedem duplicação e vazamento de camadas.

**Independent Test**: quickstart §2 e §3 — renomear `name → fullName` em
`ManagerViewSchema` faz `pnpm check-types` falhar em `apps/api` e em `apps/web`; as
guardas de fronteira, duplicação e versão de Zod passam.

### Tests for User Story 1 ⚠️ (escrever primeiro; devem falhar)

- [ ] T014 [P] [US1] Escrever `packages/contracts/test/boundary.spec.ts` (`002/US1-5`): varre `packages/contracts/src/**/*.ts` e falha se houver import de `@prisma/*`, `@nestjs/*`, `react`, `next`, `@reduxjs/*`, `express` ou caminho com `apps/`, ou literal de string com espaço fora de comentários (heurística de texto ao usuário, S7); inclui um caso negativo em memória que prova que a heurística detecta `"Dados inválidos."`
- [ ] T015 [P] [US1] Escrever `packages/contracts/test/zod-version.spec.ts` (`002/US1-6`): lê `pnpm-lock.yaml` da raiz e falha se houver mais de uma versão resolvida de `zod` (FR-007)
- [ ] T016 [P] [US1] Escrever `packages/contracts/test/duplication.spec.ts` (`002/US1-4`): importa `../src/index.ts`, coleta os nomes de tipos exportados (nomes de schemas sem o sufixo `Schema`) e os conjuntos de valores de cada `z.enum`; varre `apps/api/src/**/*.ts` e `apps/web/**/*.{ts,tsx}` (exceto `node_modules`, `.next`, `dist`, `generated`, `e2e`) e falha em `interface X`/`type X =` com nome de tipo do contrato ou em união literal com exatamente os valores de um enum do contrato; mensagem de falha lista arquivo:linha (FR-006, S7)
- [ ] T017 [P] [US1] Criar `apps/api/test/helpers/contract-conformance.interceptor.ts` conforme `contracts/contracts-package.md` §Conformidade: resolve método + caminho do handler (`PATH_METADATA` do controller e do método, `METHOD_METADATA`), encontra a entrada em `endpoints`, valida o valor devolvido com `response.safeParse` (`response: null` exige `undefined`) e, em violação, lança erro com a chave do endpoint e **só os caminhos** dos campos inválidos
- [ ] T018 [US1] Registrar o interceptor em `createTestApp()` de `apps/api/test/helpers/test-app.ts` (só testes; `main.ts`/`app.setup.ts` não mudam) — depende de T017
- [ ] T019 [P] [US1] Escrever `apps/api/test/contracts/endpoint-catalog.spec.ts` (`002/US1-2`, `002/SC-002`): lista as rotas registradas no Nest (mesma técnica de `test/security/route-declarations.spec.ts` / `test/helpers/routes.ts`) e exige correspondência de mão dupla com `endpoints` (método + caminho), total 38
- [ ] T020 [P] [US1] Escrever `apps/api/test/contracts/error-catalog.spec.ts` (`002/US1-1`): as chaves de `ErrorCatalog` são exatamente `ErrorCodeSchema.options`, e o corpo produzido pelo filtro global para um erro de cada status passa em `ErrorBodySchema`

### Implementation for User Story 1 — schemas do contrato

- [ ] T021 [P] [US1] Criar `packages/contracts/src/auth/*.ts` com `SignupRequestSchema`, `VerifyEmailRequestSchema`, `ResendVerificationRequestSchema`, `LoginRequestSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmRequestSchema`, `PublicAcceptedSchema`, `MessageResponseSchema`, `EmailVerifiedResponseSchema`, `LoginResponseSchema` (data-model §3–§4; requisições e respostas `z.strictObject`)
- [ ] T022 [P] [US1] Criar `packages/contracts/src/me/*.ts` com `MeViewSchema`, `SessionViewSchema`, `SessionListResponseSchema` (datas `IsoDateTimeSchema`)
- [ ] T023 [P] [US1] Criar `packages/contracts/src/accounts/*.ts` com `UserListQuerySchema` (copiado de `listQuerySchema` em `apps/api/src/modules/accounts/accounts.controller.ts`), `UserAccountViewSchema`, `AccountPageSchema`
- [ ] T024 [P] [US1] Criar `packages/contracts/src/provisioning/*.ts` com `TokenRequestSchema`, `AcceptInvitationRequestSchema`, `InviteRequestSchema`, `InvitationListQuerySchema`, `TeacherListQuerySchema`, `InvitationViewSchema`, `InvitationListResponseSchema`, `InvitationPreviewSchema`, `InvitationAcceptedSchema`, `ManagerViewSchema`, `ManagerListResponseSchema`, `TeacherListItemSchema`, `TeacherListResponseSchema`, `TeacherViewSchema` (arquivo `provisioning/managers.ts` contém `ManagerViewSchema`, como referido no quickstart §3)
- [ ] T025 [P] [US1] Criar `packages/contracts/src/admin-activation/*.ts` com `AdminActivationRequestSchema`, `AdminActivationPreviewSchema`, `AdminActivatedSchema` e `packages/contracts/src/health/*.ts` com `HealthStatusSchema`
- [ ] T026 [US1] Criar `packages/contracts/src/endpoints.ts` com `EndpointContract` (data-model §5) e o objeto `endpoints` com as 38 entradas da tabela de `contracts/contracts-package.md` (`as const satisfies Record<string, EndpointContract>`); exportar tudo em `packages/contracts/src/index.ts`; `pnpm --filter @repo/contracts build` — depende de T021–T025

### Implementation for User Story 1 — API migrada

- [ ] T027 [US1] Substituir os schemas locais pelos do contrato nos controllers `apps/api/src/modules/auth/signup.controller.ts`, `auth.controller.ts`, `apps/api/src/modules/provisioning/invitation-acceptance.controller.ts`, `managers.controller.ts`, `teacher-invitations.controller.ts`, `teachers.controller.ts`, `apps/api/src/modules/admin-bootstrap/admin-activation.controller.ts`, `apps/api/src/modules/accounts/accounts.controller.ts`, `apps/api/src/modules/auth/own-sessions.controller.ts` (params `UuidSchema`); o `ZodValidationPipe` não muda; `?status=` continua lido como hoje (nota do catálogo) (S5)
- [ ] T028 [US1] Remover `apps/api/src/platform/http/schemas.ts` e atualizar todos os imports restantes para `@repo/contracts` (inclusive em `apps/api/test/**`, só troca de import)
- [ ] T029 [US1] Tipar `ErrorCatalog` em `apps/api/src/platform/http/errors.ts` com `satisfies Record<ErrorCode, …>` usando `ErrorCode` do contrato; remover o `type ErrorCode` e a `interface ErrorBody` locais em favor dos do contrato (S8)
- [ ] T030 [P] [US1] `apps/api/src/modules/provisioning/invitation.view.ts`: remover `InvitableRole` e `InvitationView` locais, usar os do contrato, e converter datas com `toISOString()` no mapeador (`expiresAt`, `lastSentAt`); `InvitationRow`/`INVITATION_INCLUDE` ficam na API (S4)
- [ ] T031 [P] [US1] `apps/api/src/modules/auth/me.service.ts` (`MeView`), `own-sessions.service.ts` (`SessionView`, datas ISO) e `signup.service.ts` (`PublicAccepted`): tipos de retorno do contrato; `login.service.ts` devolve `LoginResponse` onde hoje expõe o usuário
- [ ] T032 [P] [US1] `apps/api/src/modules/provisioning/managers.service.ts` (`ManagerView`), `teachers.service.ts` (`TeacherStatus`, `TeacherListItem`, `TeacherView`), `invitation-acceptance.service.ts` (`InvitationPreview`, `AcceptedInvitation` → `InvitationAccepted`) e `role-grant-acceptance.service.ts` (`AcceptanceMode`): tipos do contrato
- [ ] T033 [P] [US1] `apps/api/src/modules/accounts/accounts.service.ts` (`UserAccountView`, `AccountPage`, `createdAt` ISO), `apps/api/src/modules/admin-bootstrap/admin-activation.service.ts` (preview/ativação) e `apps/api/src/platform/health/health.service.ts` (`HealthStatus`): tipos do contrato
- [ ] T034 [US1] `apps/api/src/modules/access-control/permissions.ts`: derivar `ROLE_KEYS` de `RoleKeySchema.options` e usar o tipo `RoleKey` do contrato (sem redefinição local); conferir que `RoleAssignmentStatus` usado nos services vem do contrato ou do Prisma, nunca de união literal local
- [ ] T035 [US1] Rodar `pnpm --filter api test`: corrigir **o código** (nunca o contrato para "aceitar" divergência, nem as asserções) até o interceptor não apontar nenhuma resposta fora do contrato; se uma resposta real divergir da documentação da 001, parar e corrigir a spec/contrato da 001 primeiro (Assumption da spec)

### Implementation for User Story 1 — tipos do web

- [ ] T036 [US1] Em `apps/web/lib/auth-api.ts`, `apps/web/lib/admin-api.ts` e `apps/web/lib/session.ts`, apagar as interfaces e uniões locais (`PublicAccepted`, `SignupInput`, `SessionView`, `AcceptanceMode`, `AdminActivationPreview`, `InvitationStatus`, `RoleAssignmentStatus`, `InvitationView`, `ManagerView`, `UserAccountView`, `TeacherStatus`, `TeacherListItem`, `TeacherView`, `AccountPage`, `InvitationPreview`, `MeView`) e usar `import type { … } from "@repo/contracts"` (re-exportando onde as telas importam), sem mudar comportamento (FR-003; a mudança de pastas é da US4)
- [ ] T037 [US1] Rodar `pnpm --filter @repo/contracts test` (T014–T016 verdes), `pnpm check-types` e `pnpm test`; executar os 6 casos do quickstart §3 (renomear, remover e trocar o tipo de um campo, numa requisição e numa resposta), ver `check-types` falhar no lado que usa a forma antiga em cada um, desfazer e registrar o resultado no PR (`002/US1-3`, `002/SC-003`)

**Checkpoint**: US1 completa — suíte de API da Fase 001 verde com as asserções intactas e o interceptor ativo; guardas verdes; web tipado pelo contrato.

---

## Phase 4: User Story 2 — Nenhuma regressão para quem usa o sistema (Priority: P1)

**Goal**: os textos exibidos pelo web vêm do catálogo de mensagens do próprio web,
idênticos aos de hoje; a suíte da Fase 001 continua a prova de não regressão.

**Independent Test**: `pnpm test` verde; a tabela de `error-messages.test.ts`
confere os 24 textos; `git diff main -- apps/api/test` só mostra imports e helpers.

### Tests for User Story 2 ⚠️

- [ ] T038 [P] [US2] Escrever `apps/web/lib/messages/error-messages.test.ts` (`002/US2-3`, `002/SC-004`): tabela fixa código → texto com os 24 textos atuais de `ErrorCatalog` (copiados literalmente de `apps/api/src/platform/http/errors.ts`) mais `NETWORK_ERROR` e `UNEXPECTED_RESPONSE` (textos atuais de `apps/web/lib/api-client.ts`/`auth-api.ts`); código desconhecido → texto de `UNEXPECTED_RESPONSE`; `RATE_LIMITED` com `Retry-After` → frase atual com minutos
- [ ] T039 [P] [US2] Estender `apps/web/lib/api-client.test.ts` (`002/US2-3`): um `ApiError` com `code` conhecido e `message` diferente vinda do servidor exibe o texto do catálogo, não o `message` da API

### Implementation for User Story 2

- [ ] T040 [US2] Criar `apps/web/lib/messages/error-messages.ts` (`satisfies Record<ErrorCode, string>` com `ErrorCode` do contrato + os dois códigos do web) e `messageForError(error: unknown)`; substituir a lógica de `errorMessage` em `apps/web/lib/auth-api.ts` por essa função, mantendo o formato com `Retry-After` (FR-013, S8)
- [ ] T041 [US2] Revisar `git diff main -- apps/api/test apps/web` e confirmar que nenhuma asserção, status, código ou corpo verificado mudou (só imports/helpers); rodar `pnpm test` completo e o guarda `apps/api/test/traceability.spec.ts` (`002/US2-1`, `002/SC-001`, `002/SC-004`)

**Checkpoint**: US1 + US2 — contrato único e texto de erro desacoplado do backend, sem nenhuma mudança visível.

---

## Phase 5: User Story 3 — Telas no sistema de componentes oficial (Priority: P2)

**Goal**: Tailwind 4 + shadcn/ui + Lucide com a paleta atual; componentes
compartilhados refeitos sobre shadcn com a mesma acessibilidade; as 11 telas, a
navegação e a home estilizadas com eles.

**Independent Test**: `pnpm --filter web test` (axe e `SC-012` em todas as telas,
`contrast.test.ts`) verde; abrir as telas em tema claro e escuro (quickstart §5) e ver
a mesma aparência.

### Tests for User Story 3 ⚠️

- [ ] T042 [P] [US3] Escrever `apps/web/test/contrast.test.ts` (`002/US3-3`, `002/US3-4`): lê `apps/web/app/globals.css`, extrai os tokens do tema claro e do bloco `prefers-color-scheme: dark`, e exige 4.5:1 para `foreground/background`, `foreground/card`, `muted-foreground/background`, `muted-foreground/card`, `primary-foreground/primary`, `destructive/background`, `destructive/danger-surface` e 3:1 para `border/background` e `ring/background`, nos dois temas (S12). Falha antes de T045 porque os tokens shadcn ainda não existem

### Implementation for User Story 3

- [ ] T043 [US3] Adicionar em `apps/web/package.json`: `tailwindcss` e `@tailwindcss/postcss` (dev), `lucide-react`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` (prod), nas versões de research.md; criar `apps/web/postcss.config.mjs` com `@tailwindcss/postcss`
- [ ] T044 [US3] Adicionar `paths: { "@/*": ["./*"] }` em `apps/web/tsconfig.json` e o alias equivalente em `apps/web/vitest.config.ts`; criar `apps/web/components.json` (estilo `new-york`, `rsc: true`, `tsx: true`, `iconLibrary: lucide`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, css `app/globals.css`) (S12)
- [ ] T045 [US3] Reescrever `apps/web/app/globals.css`: `@import "tailwindcss"`, tokens shadcn com os valores hex atuais (tabela de data-model §6; valores do tema escuro copiados do arquivo atual), `@media (prefers-color-scheme: dark)`, `@theme inline` expondo os tokens, `--radius: 6px`, estilos base de foco visível e do *skip link*; manter a fonte Geist local — T042 fica verde
- [ ] T046 [US3] Gerar com `pnpm dlx shadcn@4.21.0 add button input label table alert` os arquivos `apps/web/components/ui/{button,input,label,table,alert}.tsx` e `apps/web/lib/utils.ts` (`cn()`); ajustar só o necessário para acessibilidade/tema (variante `destructive` do `Alert` usando `--danger-surface`)
- [ ] T047 [US3] Recriar `Field`, `ErrorSummary` e `SubmitButton` em `apps/web/components/shared/{field,error-summary,submit-button}.tsx` sobre `Label`/`Input`/`Alert`/`Button`, preservando ids `-dica`/`-erro`, "(obrigatório)", `aria-describedby`, `aria-invalid`, região `aria-live="polite"` sempre presente, foco no resumo, links que focam o campo, `aria-disabled`/`aria-busy` e `role="status"`; mover `apps/web/components/form/form.test.tsx` para `apps/web/components/shared/form.test.tsx` só trocando imports (asserções iguais); criar `apps/web/components/shared/index.ts`
- [ ] T048 [US3] Mover `apps/web/components/{no-access,site-nav,logout-button}.tsx` e `site-nav.test.tsx` para `apps/web/components/shared/`, estilizar com `Button`/Tailwind mantendo textos e ordem de foco; ícones Lucide só decorativos (`aria-hidden`)
- [ ] T049 [US3] Estilizar `apps/web/app/layout.tsx` e `apps/web/app/page.tsx` com Tailwind/shadcn, mesmos textos, *skip link* e landmarks
- [ ] T050 [P] [US3] Estilizar as telas públicas `apps/web/app/(public)/{entrar/login-form,cadastro/signup-form,verificar-email/verify-email,esqueci-senha/forgot-password-form,redefinir-senha/reset-password-form,convite/invitation-acceptance,ativar-admin/admin-activation}.tsx` com Tailwind e `components/shared` (imports de `components/form` → `components/shared`), sem mudar textos nem ordem dos campos; testes existentes só trocam imports
- [ ] T051 [P] [US3] Estilizar as telas autenticadas `apps/web/app/conta/sessoes/sessions-list.tsx`, `apps/web/app/admin/managers/managers-admin.tsx`, `apps/web/app/admin/usuarios/users-admin.tsx`, `apps/web/app/professores/teachers-admin.tsx` com `Table` (`<caption>` visualmente oculta, `th[scope=col]`, botões com `aria-label` do alvo), `Button` e `Alert`; testes existentes só trocam imports
- [ ] T052 [US3] Remover `apps/web/components/form/` e as classes CSS antigas que ficaram sem uso; rodar `pnpm --filter web test` (axe + `SC-012` em todas as telas) e conferir visualmente claro/escuro (quickstart §5) (`002/US3-1`, `002/US3-2`, `002/SC-005`)

**Checkpoint**: US3 — sistema visual oficial com a mesma aparência e acessibilidade.

---

## Phase 6: User Story 4 — Dados do servidor e formulários pelos padrões oficiais (Priority: P2)

**Goal**: web organizado em `features/`, TanStack Query para dados do servidor, React
Hook Form com os schemas do contrato, lint que impede componente de chamar a API,
cache limpo no logout e em `401`.

**Independent Test**: quickstart §4 (lint falha com import de `@/lib/api/client` num
componente) e §5 (revogar sessão, convidar/reenviar/revogar atualizam listas sem
recarregar; troca de conta não mostra dados anteriores).

### Tests for User Story 4 ⚠️

- [ ] T053 [P] [US4] Criar `apps/web/test/render.tsx` com `renderWithProviders(ui, { queryClient? })` (novo `QueryClient` por teste, `retry: false`) e escrever `apps/web/lib/query/query-client.test.ts` (`002/US4-4`): um `ApiError` 401 numa query ou mutação chama `queryClient.clear()` e navega para `/entrar?next=<rota>`; `retry` só ocorre para `NETWORK_ERROR`
- [ ] T054 [P] [US4] Escrever `apps/web/test/lint-boundaries.test.ts` (`002/US4-5`): usa a API do ESLint com `apps/web/eslint.config.js` sobre textos virtuais e exige erro para `import { apiClient } from "@/lib/api/client"` em `features/x/components/a.tsx`, para `fetch(...)` em `features/x/components/a.tsx`, para `@reduxjs/toolkit` e `axios` em qualquer arquivo; para o mesmo import em `app/x/page.tsx` e `app/layout.tsx`; e nenhum erro para ele em `features/x/api/a.ts` e `features/x/api/server.ts`; erro para `import { fetchX } from "@/features/x/api/server"` em `features/x/components/a.tsx` e `features/x/hooks/a.ts`, e nenhum erro para ele em `app/x/page.tsx`
- [ ] T055 [P] [US4] Escrever `apps/web/features/auth/schemas/form-messages.test.ts` (`002/FR-022`, S9): para cada schema de formulário, campo vazio → texto atual do campo e e-mail/nome/tamanho inválido → "Dados inválidos."; confirmação de senha diferente → texto atual; nenhuma mensagem em inglês

### Implementation for User Story 4 — fundação do web

- [ ] T056 [US4] Adicionar `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers` em `apps/web/package.json`; mover com `git mv` `apps/web/lib/api-client.ts` → `apps/web/lib/api/client.ts` (e o teste) e `apps/web/lib/server-api.ts` → `apps/web/lib/api/server.ts`, sem mudar comportamento
- [ ] T057 [US4] Criar `apps/web/lib/query/query-client.ts` (`makeQueryClient()` com `staleTime: 30_000`, `refetchOnWindowFocus: false`, retry só para `NETWORK_ERROR`, `QueryCache`/`MutationCache` com `onError` para 401) e `apps/web/app/providers.tsx` (`"use client"`, `QueryClient` em `useState`); envolver a árvore em `apps/web/app/layout.tsx` — T053 verde
- [ ] T058 [US4] Adicionar as regras de `contracts/web-architecture.md` §Regras de camada em `apps/web/eslint.config.js` (`no-restricted-imports` de `@/lib/api/*` fora de `features/*/api/**` e `lib/**`, inclusive em `app/**`; `no-restricted-globals` `fetch` fora de `lib/api/**`, `e2e/**` e testes; `@reduxjs/*` e `axios` proibidos; `@repo/contracts` como valor proibido em `components/shared/**`; `@/features/*/api/server` proibido em `features/*/{components,hooks}/**` e `components/**`, que rodam no cliente) — T054 verde
- [ ] T059 [US4] Mover `STATUS_LABELS`, `ROLE_LABELS` e `formatDateTime` de `apps/web/lib/admin-api.ts` para `apps/web/lib/messages/{status-labels,dates}.ts`

### Implementation for User Story 4 — features (uma por vez; cada tela mantém seu teste com os títulos da Fase 001, agora com `renderWithProviders`)

- [ ] T060 [US4] Feature `auth`: criar `apps/web/features/auth/api/{auth,server}.ts` (funções de `authApi`; `getMe` de `lib/session.ts` em `server.ts`, usado por `app/layout.tsx` e pelas `page.tsx`; tudo tipado pelo contrato), `apps/web/features/auth/schemas/*.ts` (formulários derivados de `LoginRequestSchema`, `SignupRequestSchema`, `ResendVerificationRequestSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmRequestSchema` + confirmação com `refine`; mapa de mensagens por campo; constantes `PASSWORD_MIN_LENGTH`/`passwordLength` da dica atual) e `apps/web/features/auth/hooks/*.ts` (`useMutation`); T055 verde
- [ ] T061 [US4] Mover com `git mv` `login-form`, `signup-form`, `verify-email`, `forgot-password-form`, `reset-password-form` e seus testes de `apps/web/app/(public)/*/` para `apps/web/features/auth/components/`; reescrever os formulários com `useForm` + `zodResolver` e os hooks da feature; bloquear envio duplicado por `formState.isSubmitting`; as `page.tsx` só compõem os componentes; `metadata`, redirecionamentos e `Referrer-Policy` iguais. Novos casos nos testes movidos: dois cliques seguidos em enviar fazem uma só requisição, em cada um dos cinco formulários (`002/US4-3`); em `verify-email` e `reset-password-form`, após o fluxo nenhuma query contém o token e `localStorage`/`sessionStorage` estão vazios (`002/FR-027`)
- [ ] T062 [US4] Ligar `apps/web/components/shared/logout-button.tsx` a `features/auth/hooks` (logout e "sair de todos") com `queryClient.clear()` antes de navegar; teste em `apps/web/features/auth/components/logout.test.tsx` (`002/US4-4`)
- [ ] T063 [P] [US4] Feature `sessions`: `apps/web/features/sessions/{api,hooks}/` (`sessionsKeys`, `useOwnSessions(initialData)`, `useRevokeSession` com `setQueryData`/`invalidateQueries`), mover `sessions-list.tsx` + `sessoes.test.tsx` para `apps/web/features/sessions/components/`; `apps/web/features/sessions/api/server.ts` com `fetchOwnSessions()` (usa `serverGet`, substitui `getOwnSessions` de `lib/session.ts`); `apps/web/app/conta/sessoes/page.tsx` passa `initialData` dessa função; novo caso no teste: revogar outra sessão remove a linha sem recarregar (`002/US4-1`)
- [ ] T064 [P] [US4] Feature `admin-activation`: `apps/web/features/admin-activation/{api,hooks,schemas,components}/` (preview e ativação só em **mutações**; nada em chave de query nem storage), mover `admin-activation.tsx` + `ativar-admin.test.tsx`; novos casos: após o fluxo, nenhuma query contém o token e `localStorage`/`sessionStorage` estão vazios (`002/FR-027`); dois cliques em ativar fazem uma só requisição (`002/US4-3`)
- [ ] T065 [P] [US4] Feature `invitations`: `apps/web/features/invitations/{api,hooks,schemas,components}/` (preview/aceite só em mutações), mover `invitation-acceptance.tsx` + `convite.test.tsx`; mesmos casos de token e de duplo clique de T064
- [ ] T066 [P] [US4] Feature `managers`: `apps/web/features/managers/{api,hooks,schemas,components}/` (`managersKeys.list()`, `managersKeys.invitations(status)`; convidar, reenviar, revogar, desativar, reativar com `setQueryData` + `invalidateQueries`; formulário de convite com `InviteRequestSchema`; `SELF_INVITE_FORBIDDEN`, `ALREADY_MANAGER`, `INVITATION_ALREADY_PENDING` no campo e-mail), `apps/web/features/managers/api/server.ts` para os dados iniciais; mover `managers-admin.tsx` + `managers.test.tsx`; `apps/web/app/admin/managers/page.tsx` com `initialData` dessa função; novos casos: reenviar/revogar atualizam a tabela sem recarregar (`002/US4-2`); dois cliques em convidar fazem uma só requisição (`002/US4-3`)
- [ ] T067 [P] [US4] Feature `accounts`: `apps/web/features/accounts/{api,hooks,schemas,components}/` (`["accounts","list",query,cursor]`, suspender/reativar), `apps/web/features/accounts/api/server.ts` para os dados iniciais; mover `users-admin.tsx` + `usuarios.test.tsx`; `apps/web/app/admin/usuarios/page.tsx` com `initialData` dessa função; novo caso: suspender atualiza a linha (`002/US4-2`)
- [ ] T068 [P] [US4] Feature `teachers`: `apps/web/features/teachers/{api,hooks,schemas,components}/` (chaves de data-model §6; convidar, reenviar, revogar, suspender, desativar, reativar), `apps/web/features/teachers/api/server.ts` para os dados iniciais; mover `teachers-admin.tsx` + `professores.test.tsx`; `apps/web/app/professores/page.tsx` com `initialData` dessa função; novos casos: ação atualiza a lista (`002/US4-2`); dois cliques em convidar fazem uma só requisição (`002/US4-3`)
- [ ] T069 [US4] Remover `apps/web/lib/auth-api.ts`, `apps/web/lib/admin-api.ts`, `apps/web/lib/session.ts` e quaisquer restos fora de `features/`; `app/` contém só `page.tsx`, `layout.tsx`, `providers.tsx`, `globals.css`, fontes e ícone, e nenhum arquivo de `app/` importa `@/lib/api/*` (FR-025, FR-026); rodar `pnpm lint`, `pnpm check-types`, `pnpm test` (inclui `duplication.spec.ts` e `traceability.spec.ts` da 001)
- [ ] T070 [US4] Rodar quickstart §4 e §5 manualmente (lint com import proibido; revogar/convidar sem recarregar; troca de conta na mesma aba; percorrer as 11 telas conferindo rótulos, textos, rotas e redirecionamentos) e registrar no PR (`002/US2-2`)

**Checkpoint**: US4 — web no padrão oficial; nenhum componente chama a API.

---

## Phase 7: User Story 5 — E2E no navegador e integração contínua (Priority: P3)

**Goal**: 7 jornadas Playwright contra API, banco e Mailpit reais, isoladas do dev;
pipeline de CI com lint, tipos, build e testes.

**Independent Test**: quickstart §6 (`pnpm --filter web test:e2e` verde em ≤ 10 min) e
§7 (workflow verde no PR; commit que quebra um teste deixa o status vermelho).

### Infraestrutura E2E

- [ ] T071 [US5] Adicionar `@playwright/test` (dev) e o script `"test:e2e": "playwright test -c e2e/playwright.config.ts"` em `apps/web/package.json`; excluir `e2e/**` em `apps/web/vitest.config.ts` e do `tsconfig`/ESLint do app onde necessário; ignorar `apps/web/test-results/` e `apps/web/playwright-report/` em `apps/web/.gitignore`
- [ ] T072 [US5] Criar `apps/web/e2e/.env.e2e` (só valores de exemplo: `NODE_ENV=development`, `PORT=4100`, `WEB_ORIGIN=http://localhost:3100`, `DATABASE_URL` do banco `devtrack_e2e` no `postgres-test`, SMTP do Mailpit, demais chaves de `apps/api/.env.example`) conforme `contracts/ci-and-e2e.md`
- [ ] T073 [US5] Criar `apps/web/e2e/playwright.config.ts` (Chromium, `baseURL` `http://localhost:3100`, `globalSetup`, `webServer` para API `node dist/main.js` em `apps/api` com as variáveis de `.env.e2e` e para web `next start --port 3100` com `API_ORIGIN=http://localhost:4100`, `reuseExistingServer: false`, tempo total compatível com ≤ 10 min)
- [ ] T074 [US5] Criar `apps/web/e2e/global-setup.ts` (depende do `pnpm build` de T083, porque o CLI roda `dist/`): lê `apps/web/e2e/.env.e2e` num objeto e **aborta antes de qualquer comando** se o nome do banco em `DATABASE_URL` não contiver `e2e`; cria o banco `devtrack_e2e` se não existir; roda `prisma migrate reset --force` e `pnpm --filter api admin:bootstrap --email <único> --print-link` com `env: { ...process.env, ...e2eEnv }` (as variáveis já definidas têm precedência sobre `apps/api/.env` em `prisma.config.ts` e em `--env-file-if-exists`, então o banco de dev nunca é alcançado); guarda o link para as jornadas (FR-031)
- [ ] T075 [US5] Criar `apps/web/e2e/fixtures/{mailpit,emails,journeys}.ts`: cliente da API HTTP do Mailpit com *polling* e tempo-limite filtrando por destinatário, gerador `<jornada>-<timestamp>@example.test`, helpers de cadastro/verificação/login

### Jornadas E2E (cada título com o id do cenário)

- [ ] T076 [P] [US5] `apps/web/e2e/signup.spec.ts` — cadastro → e-mail → verificar → login → `/conta/sessoes` (`002/US5-1`)
- [ ] T077 [P] [US5] `apps/web/e2e/signup-keyboard.spec.ts` — mesma jornada só com teclado (`002/US5-2`)
- [ ] T078 [P] [US5] `apps/web/e2e/admin-manager.spec.ts` — ativar ADMIN pelo link do bootstrap → convidar MANAGER → aceite → MANAGER entra (`002/US5-1`)
- [ ] T079 [P] [US5] `apps/web/e2e/teacher-invitation.spec.ts` — aluno cadastrado → MANAGER convida → aceite com a sessão do aluno → mesma conta com STUDENT + TEACHER (`002/US5-1`)
- [ ] T080 [P] [US5] `apps/web/e2e/password-reset.spec.ts` — esqueci a senha → e-mail → redefinir → login com a nova senha; link reaberto recusado (`002/US5-1`)
- [ ] T081 [P] [US5] `apps/web/e2e/sessions.spec.ts` — dois contextos logados → revogar o outro → "sair de todos" → sessões recusadas (`002/US5-1`)
- [ ] T082 [P] [US5] `apps/web/e2e/account-switch.spec.ts` — A vê suas sessões → sai → B entra → nenhum dado de A na tela (`002/US5-3`, `002/SC-007`)
- [ ] T083 [US5] Rodar `pnpm build && pnpm --filter web test:e2e` com `docker compose up -d postgres-test mailpit` e um `pnpm dev` aberto em paralelo; confirmar tudo verde, ≤ 10 min, sem tocar no banco de dev (`002/SC-006`, `002/US5-4`)

### Integração contínua

- [ ] T084 [US5] Criar `.github/workflows/ci.yml` conforme `contracts/ci-and-e2e.md` (gatilhos `push`/`pull_request`, `permissions: contents: read`, `concurrency`, `ubuntu-latest`, `timeout-minutes: 20`, serviço `postgres:17` em `5433:5432` com `devtrack_test` e *healthcheck*, `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` Node 24 com cache pnpm — todas fixadas por SHA com a versão em comentário; passos `pnpm install --frozen-lockfile`, `cp apps/api/.env.test.example apps/api/.env.test`, `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test`; sem segredos, sem E2E) (FR-035–FR-037)
- [ ] T085 [US5] Após push, confirmar a primeira execução verde e, num commit temporário que quebra um teste, o status vermelho; reverter o commit e registrar os links das execuções no PR (`002/US5-5`, `002/SC-009`)

**Checkpoint**: US5 — jornadas críticas cobertas no navegador e CI obrigatória.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T086 Remover `packages/ui/` e `"@repo/ui"` de `apps/web/package.json`; `pnpm install`; conferir por busca que não restam `components/form`, `lib/*-api.ts`, `lib/session.ts`, classes CSS antigas nem imports mortos (FR-040)
- [ ] T087 Mover `apps/api/DEPENDENCIES.md` para `DEPENDENCIES.md` na raiz (`git mv`), acrescentar a tabela de S17 com licença e justificativa de cada dependência direta nova, e registrar a saída de `pnpm audit --prod --audit-level high` e `pnpm licenses list --prod` (0 altas/críticas); atualizar a referência em `CLAUDE.md` e em `pnpm-workspace.yaml` (comentário de `overrides`, se houver) (FR-041, `002/SC-008`)
- [ ] T088 [P] Atualizar `README.md` e `apps/web/README.md` com a nova estrutura (`packages/contracts`, `features/`), `pnpm build` antes de `check-types`, E2E e CI (FR-042)
- [ ] T089 [P] Atualizar `CLAUDE.md`: seção Architecture (remover "There's no shared web↔API package yet" e o bloco "Target stack… which Phase 001 predates" em favor da estrutura real), comandos de E2E, `packages/contracts` e guardas novas (`duplication`, `boundary`, `zod-version`, `endpoint-catalog`, interceptor de conformidade) (FR-042)
- [ ] T090 Refazer, num worktree limpo, `specs/001-foundation-identity-access/quickstart.md` §2–§6 e `specs/002-stack-alignment/quickstart.md` §1–§8; corrigir os comandos que mudaram nos dois quickstarts (`002/US2-4`)
- [ ] T091 Rodar `pnpm lint && pnpm check-types && pnpm build && pnpm test` final e conferir o teste de latência de login (001/SC-009) e a varredura de segredos (001/SC-005) verdes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as stories.
- **US1 (Phase 3)**: depende da Phase 2. É o MVP e bloqueia o resto na prática: US2 usa `ErrorCode` e tipos do contrato; US4 usa os schemas nos formulários.
- **US2 (Phase 4)**: depende de US1 (T036, tipos do web vindos do contrato).
- **US3 (Phase 5)**: depende da Phase 2; pode começar em paralelo com US1/US2 (arquivos diferentes), mas T050/T051 tocam as mesmas telas que T036/T040 — fazer depois deles ou coordenar.
- **US4 (Phase 6)**: depende de US1, US2 (catálogo de mensagens) e US3 (`components/shared` sobre shadcn).
- **US5 (Phase 7)**: E2E depende de US4 (telas finais); CI (T084–T085) depende só do Setup e pode entrar mais cedo se útil.
- **Polish (Phase 8)**: depende de todas.

### Within Each User Story

- Testes (T014–T020, T038–T039, T042, T053–T055) escritos antes e falhando.
- Contrato (schemas) → API → web.
- No web: fundação (T056–T059) → features (T060–T068) → remoção do legado (T069).

### Parallel Opportunities

- Setup: T003, T004.
- Foundational: T009, T011, T012.
- US1: testes T014–T017, T019, T020; schemas T021–T025; mapeadores T030–T033.
- US3: T050 e T051.
- US4: testes T053–T055; features T063–T068 depois de T060–T062.
- US5: jornadas T076–T082.

---

## Parallel Example: User Story 1

```bash
# Guardas e testes de contrato:
Task: "boundary.spec.ts em packages/contracts/test/"
Task: "zod-version.spec.ts em packages/contracts/test/"
Task: "duplication.spec.ts em packages/contracts/test/"
Task: "contract-conformance.interceptor.ts em apps/api/test/helpers/"
Task: "endpoint-catalog.spec.ts em apps/api/test/contracts/"

# Schemas por domínio:
Task: "packages/contracts/src/auth/"
Task: "packages/contracts/src/me/"
Task: "packages/contracts/src/accounts/"
Task: "packages/contracts/src/provisioning/"
Task: "packages/contracts/src/admin-activation/ e health/"
```

## Parallel Example: User Story 4

```bash
# Depois de T060–T062 (auth e logout):
Task: "Feature sessions (T063)"
Task: "Feature admin-activation (T064)"
Task: "Feature invitations (T065)"
Task: "Feature managers (T066)"
Task: "Feature accounts (T067)"
Task: "Feature teachers (T068)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): contrato único, API migrada, interceptor e guardas.
3. **STOP and VALIDATE**: suíte da Fase 001 verde sem mudar asserções; quickstart §3.

### Incremental Delivery

1. US1 → US2: contrato + textos desacoplados, sem mudança visível.
2. US3: sistema visual oficial.
3. US4: features, TanStack Query, RHF, lint de camada.
4. US5: E2E e CI.
5. Polish: limpeza, dependências, documentação, quickstarts.

Cada etapa termina com `pnpm lint && pnpm check-types && pnpm test` verde e pode ir para
a `main` sozinha.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Mover arquivos com `git mv` para preservar o histórico.
- Nunca alterar asserções dos testes da Fase 001; se um deles falhar, o defeito está na migração.
- Nunca afrouxar um schema do contrato para fazer o interceptor passar.
- Commit por tarefa ou grupo lógico; commit/push só quando pedido.
