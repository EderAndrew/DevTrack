---

description: "Task list for 022 — Tema claro opcional: o usuário escolhe Escuro ou Claro em \"Meu perfil\", a escolha fica na conta, a tela já chega no tema certo e o tema claro cobre todas as telas com contraste AA, sem mudar o escuro"
---

# Tasks: 022 — Tema claro opcional

**Input**: os documentos de design em `/specs/022-light-theme/`.
**Prerequisites**:
- plan.md, spec.md, research.md (Z1–Z10) e data-model.md;
- contracts/: http-api, permissions e web-ui;
- quickstart.md;
- constituição v3.5.0; o design system da 005 (`design-system/tokens.css`, `test/contrast.test.ts`, as varreduras de
  `test/design-system/`).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-007).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 022 com prefixo (`022/US1-2`, `022/FR-016`,
  `022/SC-005`), um id literal por cenário. Onde uma tarefa cita uma faixa (`022/US1-1`…`022/US1-6`), cada cenário
  ganha o seu próprio `it`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` (`access: "session"`) e `route-declarations.spec.ts` verde.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Sem auditoria**: nenhum tipo novo em `audit-event-types.ts`; o teste da rota confere que `audit_events` não
  ganha linha (FR-015).
- **Tema escuro congelado**: nenhum valor do bloco `:root` de `tokens.css` muda (FR-002, SC-005); só o bloco novo
  `:root[data-theme="light"]` recebe cores.
- **Sem cor literal fora de `tokens.css`** e sem `prefers-color-scheme`, `localStorage` ou script inline para o tema
  (FR-003, FR-012, research Z4).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: a coluna, os contratos, o `theme` no `/me`, o bloco de tokens claro e o contraste dos dois temas
  (sem eles nenhuma história mostra nada).
- **US1** (escolher em "Meu perfil", sem piscar) e **US2** (a escolha segue a conta) são P1; a US2 depende da US1.
- **US3** (o tema claro completo e acessível) é P1 e depende só da Foundational; pode andar junto com a US1.
- **US4** (o escuro continua igual) é P2 e depende só da Foundational.
- **MVP**: Foundational + US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 022 entra na guarda de rastreabilidade e os contratos que todas as histórias usam.

- [X] T001 Incluir a 022 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 021: `feature:
  "022"`, `path: "specs/022-light-theme/spec.md"`, `stories: 4`, `scenarios: 18` (6 + 4 + 6 + 2), sem tabela de
  rastreabilidade (`rows: 0`, `rowsWithoutIds: []`),
  `successCriteria: sc(1, 7)` e `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-007"] }`, com o
  comentário "Joined in the Setup phase (T001); each story leaves `pending` with the task that writes its last test,
  each SC with the test that cites it, so the lists are empty at the end of T024".
- [X] T002 [P] Contratos em `packages/contracts/src/me/` (contracts/http-api.md, research Z3):
  - novo `preferences.ts`: `UiThemeSchema = z.enum(["DARK", "LIGHT"])`, `UpdatePreferencesRequestSchema =
    z.strictObject({ theme: UiThemeSchema })`, `PreferencesViewSchema = z.strictObject({ theme: UiThemeSchema })` e os
    tipos por `z.infer`;
  - exportar em `packages/contracts/src/index.ts`; `pnpm --filter @repo/contracts build && pnpm --filter
    @repo/contracts test` (boundary, duplication, zod-version).
  - O `theme` do `MeViewSchema` entra na T005 e a entrada `"me.preferences.update"` do `endpoints.ts` na T011,
    junto com o código que os atende: antes disso, o interceptor de conformidade dos testes transformaria o
    `GET /me` em 500 e o `endpoint-catalog.spec.ts` falharia por uma entrada sem rota.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a preferência existe e chega no `/me`; o tema claro existe nos tokens com contraste AA.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [X] T003 Migração e Prisma (data-model.md, research Z1):
  - `apps/api/prisma/schema.prisma`: `enum UiTheme { DARK LIGHT @@map("ui_theme") }` e `theme UiTheme
    @default(DARK)` em `User`;
  - `apps/api/prisma/migrations/<timestamp>_022_light_theme/migration.sql`: `CREATE TYPE "ui_theme" AS ENUM ('DARK',
    'LIGHT')` e `ALTER TABLE "users" ADD COLUMN "theme" "ui_theme" NOT NULL DEFAULT 'DARK'`;
  - `pnpm --filter api prisma generate` e `migrate deploy` no banco de dev;
  - se `apps/api/test/security/domain-boundary.spec.ts` listar enums, incluir `UiTheme` na lista esperada.
- [X] T004 [P] Teste `apps/api/test/integration/022-schema.spec.ts`: `022/FR-003` uma conta criada sem tema lê
  `DARK` no banco; um valor fora do enum é recusado pelo PostgreSQL; a coluna é `NOT NULL`.
- [X] T005 `theme: UiThemeSchema` em `MeViewSchema` (`packages/contracts/src/me/me.ts`, rebuild dos contratos);
  `MeService.get` (`apps/api/src/modules/auth/me.service.ts`) seleciona e devolve `theme`; o login
  (`login.service.ts`, `user: MeView`) também. Testes em `apps/api/test/integration/022-preferences.spec.ts` (criado
  aqui, completado na US1): `022/FR-003` `GET /me` de uma conta nova devolve `theme: "DARK"`; a resposta do login traz
  `user.theme`. Ajustar os asserts que comparam o `MeView` inteiro por igualdade (`toEqual`/`toStrictEqual` sobre o
  corpo de `GET /me` ou o `user` do login; achar com `grep -rln '"/me"\|auth/login' apps/api/test`).
- [X] T006 [P] Testes primeiro em `apps/web/test/contrast.test.ts` (research Z10):
  - `THEMES` ganha `claro: { ...dark, ...blockTokens(css, /:root\[data-theme="light"\]\s*\{/) }` (os aliases resolvem
    pelos `var()` do bloco escuro, como no navegador); os 76 pares de `PAIRS` e `SYNTAX_PAIRS` rodam para os dois
    temas — títulos com `022/FR-011 022/SC-002` além dos ids que já têm;
  - `022/FR-010 022/SC-006`: todo token de cor (valor `#…` ou `rgb(…)`) declarado em `:root` tem valor no bloco claro,
    e o bloco claro não declara nenhum token que `:root` não tenha nem token que não seja cor;
  - o teste antigo "tema único escuro" passa a ser `005/SC-002 022/FR-003`: sem `prefers-color-scheme`, `color-scheme:
    dark` em `:root` e `color-scheme: light` no bloco claro.
- [X] T007 Bloco claro em `apps/web/design-system/tokens.css` (research Z5, Z6): depois do `:root` atual, sem tocá-lo,
  `:root[data-theme="light"] { … color-scheme: light; }` com os valores da tabela Z6 (fundo, superfície, textos,
  primária e variações, marca, bordas, foco, os quatro estados com `-text`/`-surface`, `--danger-foreground`,
  desabilitados, `--overlay`, os oito `--syntax-*` e `--chart-1`), cada grupo com um comentário curto da cor de
  origem; atualizar o comentário do topo do arquivo ("dark by default, optional light theme, 022"). T006 fica verde.

**Checkpoint**: `/me` traz `theme`; `<html data-theme="light">` posto à mão no navegador já mostra o tema claro.

---

## Phase 3: User Story 1 — Escolher o tema claro em "Meu perfil" (Priority: P1) 🎯 MVP

**Goal**: "Aparência" em "Meu perfil" troca o tema na hora, salva na conta, e toda tela com sessão já chega no tema
salvo (sem piscar).

**Independent Test**: conta nova → "Meu perfil" com "Escuro" marcado → "Claro" muda a página sem recarregar →
recarregar continua claro.

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] API em `apps/api/test/integration/022-preferences.spec.ts` (contracts/http-api.md, research Z2):
  `022/US1-2` `PATCH /me/preferences { theme: "LIGHT" }` → 200 `{ theme: "LIGHT" }` e `GET /me` reflete;
  `022/US1-4` de volta a `DARK`; `022/US1-6` e-mail não confirmado → 200; `022/FR-016` 400 para `theme` ausente,
  `"light"`, `"SYSTEM"`, campo a mais (`userId`), corpo vazio e não JSON, sem mudar o banco; sem sessão → 401; sem
  `Origin` permitido → 403 `ORIGIN_NOT_ALLOWED`; `022/FR-006` muda só o usuário da sessão (outro usuário continua
  `DARK`); `022/FR-015` nenhuma linha nova em `audit_events` e nenhuma outra coluna de `users` além de `theme`/
  `updated_at` muda; repetir o mesmo valor → 200 sem erro (idempotência).
- [X] T009 [P] [US1] Web `apps/web/features/profile/components/appearance-settings.test.tsx` (contracts/web-ui.md):
  `022/US1-1` seção "Aparência" com o grupo "Tema" ("Escuro", "Claro"), marcado por `me.theme`; `022/US1-2` escolher
  "Claro" põe `data-theme="light"` em `document.documentElement` antes da resposta e envia `{ theme: "LIGHT" }`;
  `022/US1-4` "Escuro" volta; `022/US1-5` com a mutação falhando, o tema e a opção anteriores voltam e aparece
  "Não foi possível salvar a aparência. Tente de novo." em `role="alert"`; com a mutação respondendo `401` (sessão
  expirada), o tema anterior volta e segue o tratamento de sessão expirada que o app já tem; o grupo fica desabilitado
  com `aria-busy`
  enquanto envia; escolher a opção já marcada não envia nada; `022/SC-001` a troca acontece no mesmo tique, sem esperar
  a rede; axe sem violações.
- [X] T010 [P] [US1] Web: atributo do layout raiz em `apps/web/app/layout.test.tsx` (novo; mock de
  `getMeForNavigation`): `022/US1-3 022/FR-008` `me.theme = "LIGHT"` → `<html data-theme="light">`; `"DARK"` →
  `dark`; `022/FR-004` `null` (sem sessão ou falha) → `dark`.

### Implementation for User Story 1

- [X] T011 [US1] API: `MeService.updatePreferences(userId, body)` (um `UPDATE users SET theme` pelo id) e `@Patch
  ("preferences") @AllowUnverified()` em `apps/api/src/modules/auth/me.controller.ts` e a entrada
  `"me.preferences.update": { method: "PATCH", path: "/me/preferences", body: UpdatePreferencesRequestSchema, response:
  PreferencesViewSchema, status: 200 }` ao lado de `"me.get"` em `packages/contracts/src/endpoints.ts`, validando com
  `UpdatePreferencesRequestSchema` e devolvendo `PreferencesView`; linha `{ method: "PATCH", path: "/me/preferences",
  access: "session" }` em `apps/api/test/security/authorization-matrix.ts`; `endpoint-catalog.spec.ts` e
  `route-declarations.spec.ts` verdes. T008 fica verde.
- [X] T012 [US1] Web, tema no servidor (research Z4): `getMe` envolvido em `cache()` do React em
  `apps/web/features/auth/api/server.ts`; `apps/web/app/layout.tsx` vira `async`, lê `getMeForNavigation()` e renderiza
  `<html lang="pt-BR" data-theme={me?.theme === "LIGHT" ? "light" : "dark"}>`; atualizar o comentário do layout. T010
  fica verde.
- [X] T013 [US1] Web, a troca (research Z7):
  - `apps/web/features/profile/schemas/appearance.ts`: rótulos ("Aparência", "Tema", "Escuro", "Claro") e a mensagem
    de falha;
  - `apps/web/features/profile/api/preferences.ts`: `updatePreferences(body)` por `lib/api`;
  - `apps/web/features/profile/hooks/use-update-theme.ts`: mutação TanStack que aplica `dataset.theme` no
    `onMutate`, devolve o anterior para o `onError`, atualiza os dados de `me` e chama `router.refresh()` no
    `onSuccess`;
  - `apps/web/features/profile/components/appearance-settings.tsx`: a seção com o `RadioGroup` da 005;
  - `apps/web/app/(account)/conta/perfil/page.tsx`: `<AppearanceSettings theme={me.theme} />` depois de
    `ProfileDetails`, para toda sessão (também sem e-mail confirmado). T009 fica verde.
- [X] T014 [US1] Fixtures do web que montam um `MeView` completo (ex.: `apps/web/features/design-system/components/fixtures.ts`)
  ganham `theme`; `pnpm --filter web check-types` verde. A US1 sai de `pending` em `traceability.spec.ts`.

**Checkpoint**: o quickstart passos 1–3 e 8–9 funcionam.

---

## Phase 4: User Story 2 — A escolha segue o usuário em qualquer dispositivo (Priority: P1)

**Goal**: o tema vem da conta em qualquer sessão; entrar e sair recarregam o tema certo.

**Independent Test**: "Claro" numa sessão; entrar com a mesma conta em outro navegador → primeira tela já clara.

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] API em `022-preferences.spec.ts`: `022/US2-1` gravar `LIGHT` numa sessão e fazer login de novo
  (outra sessão) → `user.theme` e o `GET /me` da nova sessão são `LIGHT`; `022/US2-2` duas sessões: a troca numa é
  lida pela outra no próximo `GET /me`.
- [X] T016 [P] [US2] Web: `022/US2-3 022/US2-4` em `apps/web/features/auth/components/entrar.test.tsx` (login) e
  `apps/web/features/auth/components/logout.test.tsx`: o login e a saída chamam `router.refresh()` depois de navegar
  (o layout raiz relê o tema da conta; research Z8). Se já houver o assert, só acrescentar os ids ao título.

### Implementation for User Story 2

- [X] T017 [US2] Se T016 falhar, garantir `router.refresh()` depois de `router.replace(...)` no login
  (`login-form.tsx`), na aceitação de convite que entra direto (`features/class-invitations`, `features/invitations`)
  e em `useLeave` (`components/shared/logout-button.tsx`). A US2 sai de `pending`.

**Checkpoint**: o quickstart passos 4 e 7 funcionam.

---

## Phase 5: User Story 3 — O tema claro é completo e acessível em todas as telas (Priority: P1)

**Goal**: nenhuma parte da tela fica presa no escuro; realce de código, gráficos, modo prova e catálogo seguem o tema.

**Independent Test**: no tema claro, percorrer o catálogo e as telas principais de cada papel sem nenhuma área escura
e com os pares de contraste verdes.

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Varredura de dependências do tema escuro em `apps/web/test/design-system/theme-agnostic.test.ts`
  (novo): `022/FR-012 022/US3-1` nenhum arquivo de `app/`, `components/` ou `features/` usa `prefers-color-scheme`,
  `dark:` do Tailwind, `colorScheme`/`color-scheme` fora de `tokens.css`, ou passa `dark: true` a um tema do
  CodeMirror; `022/US3-3` o tema do editor (`components/ui/code/editor-theme.ts`) e o do `CodeBlock` usam só
  `var(--…)`.
- [X] T019 [P] [US3] Catálogo em `apps/web/features/design-system/components/catalog.test.tsx`: `022/FR-014 022/US3-5`
  o seletor "Tema do catálogo" troca `data-theme` de `<html>` sem chamada à API; axe e a ordem de Tab rodam com
  `data-theme="dark"` e com `data-theme="light"`.
- [X] T020 [P] [US3] Modo prova e cores forçadas: `022/US3-4` num teste do `ExamTimer`/`WarningDialog`
  (`apps/web/components/ui/assessment/*.test.tsx`) com `data-theme="light"`, as classes continuam só de tokens e axe
  sem violações; `022/US3-6 022/FR-013` a regra `forced-colors` de `tokens.css` continua fora dos dois blocos de tema
  (asserção em `contrast.test.ts`).

### Implementation for User Story 3

- [X] T021 [US3] Corrigir o que T018 apontar (trocar por tokens; nenhum `dark:` nem cor literal) e o seletor do
  catálogo: `apps/web/features/design-system/components/catalog-theme-switch.tsx` (`RadioGroup` "Tema do catálogo",
  muda `document.documentElement.dataset.theme`, sem salvar) montado no topo da página do catálogo; entrada no
  `registry.ts` se a varredura do catálogo exigir. T018–T020 ficam verdes; a US3 sai de `pending`.

**Checkpoint**: o quickstart passos 5, 6 e 10 funcionam.

---

## Phase 6: User Story 4 — O tema escuro continua igual (Priority: P2)

**Goal**: nenhum valor do tema escuro muda; a preferência do sistema operacional segue ignorada.

**Independent Test**: comparar os valores do bloco `:root` com a cópia congelada de antes da feature.

### Tests for User Story 4 ⚠️

- [X] T022 [P] [US4] Em `apps/web/test/contrast.test.ts`: `022/US4-1 022/FR-002 022/SC-005` o bloco `:root` é
  igual, token a token, a uma cópia literal dos valores de cor de antes da 022 (copiada do `tokens.css` de `main` no
  início da fase); `022/US4-2` nenhuma regra `@media (prefers-color-scheme…)` em `tokens.css` nem em `globals.css`.

### Implementation for User Story 4

- [X] T023 [US4] Nenhum código novo esperado; se T022 falhar, desfazer a mudança no bloco escuro. A US4 sai de
  `pending`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T024 E2E `apps/web/e2e/light-theme.spec.ts` (quickstart):
  - `022/US1-2` "Claro" em "Meu perfil" muda `<html data-theme>` sem navegação;
  - `022/SC-003` recarregar: o HTML da resposta já traz `data-theme="light"`;
  - `022/SC-004` outro contexto do navegador, login → primeira tela clara;
  - `022/SC-007` sair → `/entrar` com `data-theme="dark"`;
  - `022/US2-3` outra conta no mesmo contexto → escura.
  Todos os SC saem de `pending`, que fica vazio.
- [X] T025 [P] Documentação:
  - `specs/005-design-system/spec.md` FR-013: emenda 2026-10-29 ("tema escuro padrão e tema claro opcional, escolhido
    pelo usuário em Meu perfil (022)");
  - `apps/web/design-system/tokens.md`: os dois temas, a tabela de valores claros com a cor de origem (Z6);
  - `apps/web/design-system/README.md` e `layouts.md`: de onde vem o tema (layout raiz, `me.theme`, escuro sem sessão);
  - `apps/web/CLAUDE.md`: uma regra "Tema (022)" (cores só por tokens, o atributo vem do layout raiz, a troca em
    `features/profile`, nada de `prefers-color-scheme`/`dark:`);
  - `apps/api/CLAUDE.md`: a rota `PATCH /me/preferences` (acesso de sessão, sem auditoria).
  `docs.test.ts` verde.
- [X] T026 Verificação final: `pnpm lint && pnpm check-types && pnpm test`; percorrer o quickstart no navegador nos
  dois temas (telas de cada papel, prova controlada, catálogo); `pending` da 022 vazio em `traceability.spec.ts`.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T002) → Foundational (T003–T007) → histórias → Polish.
- **US1 (T008–T014)**: depende da Foundational.
- **US2 (T015–T017)**: depende da US1 (a rota grava o tema).
- **US3 (T018–T021)**: depende só da Foundational; pode andar junto com a US1.
- **US4 (T022–T023)**: depende só da Foundational.
- **Polish (T024–T026)**: depois de todas.
- **Dentro de cada história**: testes → API → web.

## Parallel Opportunities

- **Setup**: T002 junto com T001.
- **Foundational**: T004 e T006 em paralelo; T005 depois da T003; T007 depois da T006.
- **US1**: T008, T009 e T010 juntos; T011 (API) e T012 (layout raiz) em paralelo; T013 depois da T012.
- **US3 e US4**: em paralelo com a US1; dentro da US3, T018, T019 e T020 juntos.
- **Polish**: T025 em paralelo com T024.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1: o usuário escolhe o tema claro e ele fica na conta, sem piscar.
2. **Incremento 2**: US2 (a escolha segue a conta em qualquer sessão; entrar e sair recarregam o tema).
3. **Incremento 3**: US3 (nenhuma área presa no escuro, catálogo nos dois temas) e US4 (escuro congelado).
4. **Incremento 4**: Polish (E2E, documentação, emenda da 005).
