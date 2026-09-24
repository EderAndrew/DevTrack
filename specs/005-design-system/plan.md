# Implementation Plan: 005 — Design System e Identidade Visual (Fundação de UI/UX)

**Branch**: `005-design-system` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-design-system/spec.md`

## Summary

O web ganha a fundação visual oficial sem mudar comportamento. Os tokens saem do
`globals.css` para `apps/web/design-system/tokens.css`, com a paleta pedida como base e
variantes acessíveis onde a medição mostrou contraste abaixo de AA (V3). O tema escuro
existente é remapeado (V4). As escalas padrão do Tailwind 4 que o Design System
substitui são zeradas, para só os tokens oficiais gerarem classes (V2). Inter e
JetBrains Mono entram como arquivos locais, no lugar da Geist (V5), com escala tipográfica
de nove categorias (V6), espaçamento em múltiplos de 4 (V7), três raios, três sombras,
camadas, pontos de quebra, movimento e foco (V8). Os componentes shadcn existentes são
padronizados, os que faltam entram a partir do pacote `radix-ui` já instalado, e controles
nativos viram componentes fundamentais (V10, V11). As telas internas passam ao AppShell
(menu lateral, `Topbar`, `PageHeader`), "Minhas turmas" ao layout do aluno e as telas de
conta escolhem o layout pelas permissões do menu (V12, V13). Um catálogo dentro do app,
fora de produção (V14), e a documentação em `apps/web/design-system/` (V19) mostram e
explicam tudo, incluindo o contrato visual do modo avaliação, que só será construído
com a feature de avaliações (V15). Uma guarda de varredura do código impede cores,
tamanhos, espaçamentos, raios, sombras, fontes e ícones fora do padrão (V9).

## Technical Context

**Language/Version**: TypeScript 7 sobre Node.js 24 LTS
**Primary Dependencies**: web — Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui sobre `radix-ui` 1.6, Lucide React, TanStack Query 5, React Hook Form 7. **Nenhuma dependência nova**; entram dois arquivos de fonte (Inter e JetBrains Mono, SIL OFL 1.1) e sai a Geist (V5)
**Storage**: N/A (nenhuma tabela, migração, rota ou contrato da API)
**Testing**: Vitest + RTL + `vitest-axe` + testes de teclado (componentes, layouts, catálogo); testes de guarda por varredura (`token-usage`, `docs`, contraste nos dois temas); ESLint (`no-restricted-imports` de ícones, coberto por `lint-boundaries.test.ts`); Playwright (jornadas existentes, sem novas); rastreabilidade da 005 no `traceability.spec.ts`
**Target Platform**: navegadores atuais em desktop, notebook e tablet; CI GitHub Actions
**Project Type**: monorepo web (a feature só toca `apps/web`, a documentação e as guardas)
**Performance Goals**: texto visível até 100 ms após o conteúdo, sem esperar a fonte (SC-008); nenhum aumento de bundle de produção por catálogo ou documentação; só a Inter pré-carregada
**Constraints**: nenhuma mudança de comportamento, texto de mensagem, rota, nome acessível ou ordem de foco (FR-036); WCAG 2.2 AA nos dois temas; sem Storybook nem biblioteca de UI paralela; fontes servidas pelo próprio app
**Scale/Scope**: 7 histórias, 37 requisitos; ~40 tokens de cor, 9 categorias tipográficas; 18 componentes ajustados e 15 novos; 3 layouts construídos + 1 especificado; 20 páginas com `PageHeader`; 7 arquivos com controles nativos migrados; 6 documentos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: nenhuma entrada nova; conteúdo continua renderizado como texto escapado; catálogo com dados fixos e ausente em produção (V14) ✅
- [x] **II. RBAC**: nenhuma operação protegida nova; menu, layouts e botões seguem só como experiência de uso, com as permissões já usadas pelo menu, nunca nome de papel (V13); autorização continua na API ✅
- [x] **III. Server authority**: N/A nesta feature; o contrato do modo avaliação fixa que tempo, salvamento e registro de eventos vêm do servidor ([contracts/exam-mode.md](./contracts/exam-mode.md)) ✅
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: N/A (sem mudança de esquema)
- [x] **VI. Audit & logs**: N/A (nenhuma operação crítica nova)
- [x] **VII. Tests**: contraste nos dois temas, guarda de tokens, guarda de documentação, axe e teclado em cada componente e layout, escolha de layout, rastreabilidade; todos os testes e E2E existentes seguem valendo (V17) ✅
- [x] **VIII. Layering**: tokens → `components/ui` → `components/layout` → `features/*` → `app/`; nenhuma regra de negócio em componente; ESLint de camadas mantido (V1, FR-034) ✅
- [x] **IX. Simplicity**: nenhuma dependência nova (Radix já instalado; Toast e Drawer sem `sonner`/`vaul`), sem Storybook (V14), componentes de avaliação só especificados até existirem avaliações (V15) ✅
- [x] **X. Evidence**: N/A; o contrato do aviso de perda de foco só exibe o que o servidor registrou, sem tom acusatório ✅
- [x] **XI. Human oversight**: N/A
- [x] **XII. Determinism first**: N/A (sem IA)
- [x] **XIII. Risk level**: N/A
- [x] **XIV–XV. AI governance**: N/A
- [x] **XVI. Explicit states**: estados visuais de componentes e de questão são enumerados (contrato); nenhum workflow novo ✅
- [x] **XVII. Idempotency**: botão com `loading` impede segundo acionamento (a garantia continua no servidor) ✅
- [x] **XVIII. Safe interruption**: N/A
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: o contrato dos avisos da avaliação usa linguagem neutra e informativa, proporcional ✅
- [x] **XXI. Configurable domain**: nenhuma disciplina, linguagem ou tecnologia fixa; o contrato do editor de código não presume linguagem ✅
- [x] **XXII. Personalization & accessibility**: WCAG 2.2 AA como requisito funcional (contraste nos dois temas, foco, alvos, movimento reduzido, estados sem depender de cor) ✅
- [x] **XXIII. Curricular traceability**: N/A
- [x] **XXIV. Academic isolation**: N/A (nenhum acesso a dados novo; a escolha de layout usa `me.permissions` já disponível) ✅
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: nada muda em `packages/contracts`; nenhum tipo de contrato redefinido no web ✅
- [x] **Frontend stack**: Tailwind CSS 4 + shadcn/ui + Lucide (únicos); componentes shadcn em `components/ui`; catálogo como feature `features/design-system`; Vitest + RTL + `vitest-axe` + teclado; Playwright ✅

**Pós-design (Phase 1)**: reavaliado com [data-model.md](./data-model.md) e os contratos —
sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/005-design-system/
├── plan.md                  # este arquivo
├── research.md              # V1–V20
├── data-model.md            # tokens, registro do catálogo, layouts, exceções
├── quickstart.md            # roteiro de validação
├── contracts/
│   ├── tokens.md            # catálogo de tokens (claro e escuro) e pares de contraste
│   ├── components.md        # componentes fundamentais: variantes, estados, acessibilidade
│   ├── layouts.md           # AppShell, aluno, conta, catálogo; grupos de rota
│   └── exam-mode.md         # contrato visual do modo avaliação (só especificado)
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── design-system/
│   ├── tokens.css                 # fonte única dos tokens (V1–V8)
│   ├── README.md                  # princípios, regra 80/15/5, anti-UI genérica, camadas
│   ├── tokens.md · components.md · layouts.md · exam-mode.md · exceptions.md
├── app/
│   ├── globals.css                # importa tokens.css; @layer base usa os tokens
│   ├── layout.tsx                 # Inter + JetBrains Mono (next/font/local)
│   ├── fonts/                     # inter-latin-*.woff2, jetbrains-mono-latin-*.woff2, OFL.txt (sai GeistVF.woff)
│   ├── (app)/…                    # AppShell: turmas, disciplinas, professores, admin (sem minhas-turmas e conta)
│   ├── (student)/minhas-turmas/   # StudentLayout
│   ├── (account)/conta/{perfil,sessoes}/  # layout escolhido por permissões
│   └── (catalog)/design-system/page.tsx   # catálogo (notFound em produção)
├── components/
│   ├── ui/                        # fundamentais: ajustados + novos (native-select, radio, switch, form-field,
│   │                              #   field-message, toast, spinner, empty-state, popover, dropdown-menu,
│   │                              #   tabs, pagination, breadcrumb, status)
│   ├── layout/                    # app-shell, topbar, page-header, student-layout
│   └── shared/                    # app-sidebar, logout-button, field.tsx (Field reconstruído sobre ui/form-field)
├── features/
│   ├── design-system/             # registry.ts + components/*-showcase.tsx (catálogo)
│   └── */components/*.tsx         # migração: classes da escala, controles nativos, PageHeader
├── lib/navigation.ts              # + STAFF_AREA_PERMISSIONS e nomes de área para a Topbar
├── eslint.config.js               # + ícones fora do Lucide, UI paralela e camadas (FR-034, FR-035)
└── test/
    ├── contrast.test.ts           # lê design-system/tokens.css; todos os pares, dois temas
    ├── lint-boundaries.test.ts    # + ícones de outras bibliotecas
    └── design-system/{token-usage,docs}.test.ts

apps/api/test/traceability.spec.ts # + 005 em SPECS
CLAUDE.md                          # aponta para apps/web/design-system
```

**Structure Decision**: a feature só toca `apps/web` (e a guarda de rastreabilidade da
API). Tokens e documentação juntos em `apps/web/design-system/`; componentes shadcn em
`components/ui` (constituição); layouts em `components/layout`; catálogo como feature;
grupos de rota novos só escolhem a moldura, sem mudar URLs.

## Complexity Tracking

Sem violações da constituição a justificar.
